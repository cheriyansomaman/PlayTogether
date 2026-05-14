package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

// ── Scan helpers ──────────────────────────────────────────────────────────────

func scanParticipantRows(rows *sql.Rows) (*models.Participant, error) {
	var p models.Participant
	var gameID, teamID, email, sport, bibNumber, nationality, createdBy sql.NullString
	var age sql.NullInt64

	err := rows.Scan(
		&p.ID, &p.EventID, &gameID, &teamID,
		&p.Name, &email, &age, &sport, &bibNumber, &nationality, &createdBy,
		&p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	p.GameID = gameID.String
	p.TeamID = teamID.String
	p.Email = email.String
	p.Age = int(age.Int64)
	p.Sport = sport.String
	p.BibNumber = bibNumber.String
	p.Nationality = nationality.String
	p.CreatedBy = createdBy.String
	return &p, nil
}

func (h *Handler) getParticipantByID(id string) (*models.Participant, error) {
	rows, err := h.db.Query(
		`SELECT id, event_id, game_id, team_id, name, email, age, sport, bib_number, nationality, created_by, created_at
		 FROM pt_event_game_participants WHERE id = $1`,
		id,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, sql.ErrNoRows
	}
	return scanParticipantRows(rows)
}

// ── Request types ─────────────────────────────────────────────────────────────

type CreateParticipantRequest struct {
	Name        string `json:"name" binding:"required"`
	Email       string `json:"email"`
	Age         int    `json:"age"`
	Sport       string `json:"sport"`
	TeamID      string `json:"team_id"`
	BibNumber   string `json:"bib_number"`
	Nationality string `json:"nationality"`
	UserID      string `json:"user_id"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) ListParticipants(c *gin.Context) {
	eventID := c.Param("id")
	teamID := c.Query("team_id")

	const cols = `id, event_id, game_id, team_id, name, email, age, sport, bib_number, nationality, created_by, created_at`

	var rows *sql.Rows
	var err error
	if teamID != "" {
		rows, err = h.db.Query(
			"SELECT "+cols+" FROM pt_event_game_participants WHERE event_id=$1 AND team_id=$2 ORDER BY name ASC",
			eventID, teamID,
		)
	} else {
		rows, err = h.db.Query(
			"SELECT "+cols+" FROM pt_event_game_participants WHERE event_id=$1 ORDER BY name ASC",
			eventID,
		)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	participants := []models.Participant{}
	for rows.Next() {
		p, err := scanParticipantRows(rows)
		if err != nil {
			continue
		}
		participants = append(participants, *p)
	}
	c.JSON(http.StatusOK, participants)
}

func (h *Handler) CreateParticipant(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleMember) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event member access required"})
		return
	}

	var exists bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_events WHERE id = $1)", eventID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	var req CreateParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TeamID != "" {
		h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_event_teams WHERE id = $1)", req.TeamID).Scan(&exists)
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": "team not found"})
			return
		}
	}

	var id string
	err := h.db.QueryRow(
		`INSERT INTO pt_event_game_participants (event_id, team_id, name, email, age, sport, bib_number, nationality, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
		eventID, nullableStr(req.TeamID), req.Name, nullableStr(req.Email),
		nullableInt(req.Age), nullableStr(req.Sport), nullableStr(req.BibNumber), nullableStr(req.Nationality),
		callerID.(string),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create participant"})
		return
	}

	participant, _ := h.getParticipantByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "participant_added", EventID: eventID, Data: participant})
	c.JSON(http.StatusCreated, participant)
}

func (h *Handler) GetParticipant(c *gin.Context) {
	id := c.Param("id")
	p, err := h.getParticipantByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}
	c.JSON(http.StatusOK, p)
}

func (h *Handler) UpdateParticipant(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	p, err := h.getParticipantByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), p.EventID, models.EventRoleMember) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event member access required"})
		return
	}

	var req CreateParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TeamID != "" && req.TeamID != p.TeamID {
		var exists bool
		h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_event_teams WHERE id = $1)", req.TeamID).Scan(&exists)
		if !exists {
			c.JSON(http.StatusBadRequest, gin.H{"error": "team not found"})
			return
		}
	}

	h.db.Exec(
		`UPDATE pt_event_game_participants SET name=$1, email=$2, age=$3, sport=$4, team_id=$5, bib_number=$6, nationality=$7, updated_at=NOW()
		 WHERE id=$8`,
		req.Name, nullableStr(req.Email), nullableInt(req.Age), nullableStr(req.Sport),
		nullableStr(req.TeamID), nullableStr(req.BibNumber), nullableStr(req.Nationality), id,
	)

	updated, _ := h.getParticipantByID(id)
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DeleteParticipant(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	p, err := h.getParticipantByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), p.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.db.Exec("DELETE FROM pt_event_game_participants WHERE id = $1", id)
	c.JSON(http.StatusOK, gin.H{"message": "participant deleted"})
}
