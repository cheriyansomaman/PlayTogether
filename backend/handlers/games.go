package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

// ── Scan helpers ──────────────────────────────────────────────────────────────

func scanGameRows(rows *sql.Rows) (*models.Game, error) {
	var g models.Game
	var description, gameType, venue, createdBy, updatedBy sql.NullString
	var ageStart, ageEnd sql.NullInt64
	var scheduledAt sql.NullTime
	var teamIDsJSON, participantIDsJSON []byte

	err := rows.Scan(
		&g.ID, &g.EventID, &g.Name, &description,
		&g.GameMode, &g.AgeRestricted, &ageStart, &ageEnd,
		&gameType, &g.Status, &scheduledAt, &venue,
		&teamIDsJSON, &participantIDsJSON, &createdBy, &updatedBy,
		&g.CreatedAt, &g.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	g.Description = description.String
	g.GameType = gameType.String
	g.Venue = venue.String
	g.CreatedBy = createdBy.String
	g.UpdatedBy = updatedBy.String
	g.AgeFrom = int(ageStart.Int64)
	g.AgeTo = int(ageEnd.Int64)
	if scheduledAt.Valid {
		g.ScheduledAt = scheduledAt.Time.Format(time.RFC3339)
	}
	jsonUnmarshal(teamIDsJSON, &g.TeamIDs)
	jsonUnmarshal(participantIDsJSON, &g.ParticipantIDs)
	return &g, nil
}

func (h *Handler) getGameByID(id string) (*models.Game, error) {
	const cols = `id, event_id, name, description, individual_or_team, age_restriction, age_start, age_end,
		game_type, status, scheduled_at, venue, team_ids, participant_ids, created_by, updated_by, created_at, updated_at`

	rows, err := h.db.Query("SELECT "+cols+" FROM pt_event_games WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, sql.ErrNoRows
	}
	return scanGameRows(rows)
}

const gameSelectCols = `id, event_id, name, description, individual_or_team, age_restriction, age_start, age_end,
	game_type, status, scheduled_at, venue, team_ids, participant_ids, created_by, updated_by, created_at, updated_at`

// ── Request types ─────────────────────────────────────────────────────────────

type CreateGameRequest struct {
	Name           string   `json:"name" binding:"required"`
	Description    string   `json:"description"`
	GameType       string   `json:"game_type" binding:"required"`
	GameMode       string   `json:"game_mode"`
	ScheduledAt    string   `json:"scheduled_at"`
	Venue          string   `json:"venue"`
	AgeRestricted  bool     `json:"age_restricted"`
	AgeFrom        int      `json:"age_from"`
	AgeTo          int      `json:"age_to"`
	TeamIDs        []string `json:"team_ids"`
	ParticipantIDs []string `json:"participant_ids"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) ListGames(c *gin.Context) {
	eventID := c.Param("id")

	rows, err := h.db.Query(
		"SELECT "+gameSelectCols+" FROM pt_event_games WHERE event_id = $1 ORDER BY scheduled_at ASC NULLS LAST",
		eventID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	games := []models.Game{}
	for rows.Next() {
		g, err := scanGameRows(rows)
		if err != nil {
			continue
		}
		games = append(games, *g)
	}
	c.JSON(http.StatusOK, games)
}

func (h *Handler) CreateGame(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var exists bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_events WHERE id = $1)", eventID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	var req CreateGameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gameMode := req.GameMode
	if gameMode != "team" {
		gameMode = "individual"
	}

	var scheduledAt interface{}
	if req.ScheduledAt != "" {
		scheduledAt = req.ScheduledAt
	}

	var id string
	if err := h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		return tx.QueryRow(
			`INSERT INTO pt_event_games (event_id, name, description, individual_or_team, age_restriction, age_start, age_end,
			  game_type, status, scheduled_at, venue, team_ids, participant_ids, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9, $10, $11, $12, $13) RETURNING id`,
			eventID, req.Name, nullableStr(req.Description), gameMode, req.AgeRestricted,
			nullableInt(req.AgeFrom), nullableInt(req.AgeTo),
			nullableStr(req.GameType), scheduledAt, nullableStr(req.Venue),
			jsonMarshal(req.TeamIDs), jsonMarshal(req.ParticipantIDs), callerID.(string),
		).Scan(&id)
	}); err != nil {
		log.Printf("create game error: %v", err)
		if strings.Contains(err.Error(), "idx_pt_event_games_event_name_age") {
			c.JSON(http.StatusConflict, gin.H{"error": "a game with this name and age range already exists in this event"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create game"})
		return
	}

	game, _ := h.getGameByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "game_created", EventID: eventID, Data: game})
	c.JSON(http.StatusCreated, game)
}

func (h *Handler) GetGame(c *gin.Context) {
	id := c.Param("id")
	game, err := h.getGameByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	c.JSON(http.StatusOK, game)
}

func (h *Handler) UpdateGame(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	game, err := h.getGameByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req CreateGameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	gameMode := req.GameMode
	if gameMode != "team" {
		gameMode = "individual"
	}

	var scheduledAt interface{}
	if req.ScheduledAt != "" {
		scheduledAt = req.ScheduledAt
	}

	if err = h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		_, err := tx.Exec(
			`UPDATE pt_event_games SET name=$1, description=$2, individual_or_team=$3, age_restriction=$4, age_start=$5, age_end=$6,
			  game_type=$7, scheduled_at=$8, venue=$9, team_ids=$10, participant_ids=$11, updated_by=$12, updated_at=NOW()
			 WHERE id=$13`,
			req.Name, nullableStr(req.Description), gameMode, req.AgeRestricted,
			nullableInt(req.AgeFrom), nullableInt(req.AgeTo),
			nullableStr(req.GameType), scheduledAt, nullableStr(req.Venue),
			jsonMarshal(req.TeamIDs), jsonMarshal(req.ParticipantIDs), callerID.(string), id,
		)
		return err
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update game"})
		return
	}

	updated, _ := h.getGameByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "game_updated", EventID: game.EventID, GameID: id, Data: updated})
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) UpdateGameStatus(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	game, err := h.getGameByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req struct {
		Status models.GameStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		_, err := tx.Exec("UPDATE pt_event_games SET status=$1, updated_by=$2, updated_at=NOW() WHERE id=$3", string(req.Status), callerID.(string), id)
		return err
	})

	updated, _ := h.getGameByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "game_status_changed", EventID: game.EventID, GameID: id, Data: updated})
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) CancelGame(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	game, err := h.getGameByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	if game.Status == models.GameStatusCancelled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "game is already cancelled"})
		return
	}

	if err = h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		if _, err := tx.Exec("UPDATE pt_event_games SET status='cancelled', updated_by=$1, updated_at=NOW() WHERE id=$2", callerID.(string), id); err != nil {
			return err
		}
		_, err := tx.Exec("DELETE FROM pt_event_results WHERE game_id=$1", id)
		return err
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to cancel game"})
		return
	}

	updated, _ := h.getGameByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "game_cancelled", EventID: game.EventID, GameID: id, Data: updated})
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DeleteGame(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	game, err := h.getGameByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		_, err := tx.Exec("DELETE FROM pt_event_games WHERE id = $1", id)
		return err
	})
	c.JSON(http.StatusOK, gin.H{"message": "game deleted"})
}
