package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

// ── Scan helper ───────────────────────────────────────────────────────────────

func scanResultRow(row *sql.Row) (*models.Result, error) {
	var r models.Result
	var recordedBy sql.NullString
	var resultDataJSON []byte

	err := row.Scan(
		&r.ID, &r.EventID, &r.GameID, &resultDataJSON,
		&r.Status, &recordedBy, &r.RecordedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	r.RecordedBy = recordedBy.String
	jsonUnmarshal(resultDataJSON, &r.Entries)
	return &r, nil
}

func scanResultRows(rows *sql.Rows) (*models.Result, error) {
	var r models.Result
	var recordedBy sql.NullString
	var resultDataJSON []byte

	err := rows.Scan(
		&r.ID, &r.EventID, &r.GameID, &resultDataJSON,
		&r.Status, &recordedBy, &r.RecordedAt, &r.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	r.RecordedBy = recordedBy.String
	jsonUnmarshal(resultDataJSON, &r.Entries)
	return &r, nil
}

const resultSelectCols = `id, event_id, game_id, result_data, status, recorded_by, recorded_at, updated_at`

// ── Request types ─────────────────────────────────────────────────────────────

type RecordResultRequest struct {
	Entries []models.ResultEntry `json:"entries" binding:"required"`
	Status  string               `json:"status"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) GetGameResult(c *gin.Context) {
	gameID := c.Param("id")

	row := h.db.QueryRow(
		"SELECT "+resultSelectCols+" FROM pt_event_results WHERE game_id=$1 LIMIT 1",
		gameID,
	)
	result, err := scanResultRow(row)
	if err != nil {
		c.JSON(http.StatusOK, nil)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) ListEventResults(c *gin.Context) {
	eventID := c.Param("id")

	rows, err := h.db.Query(
		"SELECT "+resultSelectCols+" FROM pt_event_results WHERE event_id=$1 ORDER BY recorded_at DESC",
		eventID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	results := []models.Result{}
	for rows.Next() {
		r, err := scanResultRows(rows)
		if err != nil {
			continue
		}
		results = append(results, *r)
	}
	c.JSON(http.StatusOK, results)
}

func (h *Handler) RecordResult(c *gin.Context) {
	gameID := c.Param("id")
	callerID, _ := c.Get("user_id")

	game, err := h.getGameByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleMember) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event member access required"})
		return
	}

	var req RecordResultRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status == "" {
		req.Status = "partial"
	}

	uid := callerID.(string)
	entriesJSON := jsonMarshal(req.Entries)
	now := time.Now().UTC()

	// Upsert result — one result per game
	var id string
	err = h.db.QueryRow(
		`INSERT INTO pt_event_results (event_id, game_id, result_data, status, recorded_by, recorded_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (event_id, game_id) DO UPDATE
		   SET result_data=EXCLUDED.result_data, status=EXCLUDED.status,
		       recorded_by=EXCLUDED.recorded_by, updated_at=NOW()
		 RETURNING id`,
		game.EventID, gameID, entriesJSON, req.Status, uid, now,
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record result"})
		return
	}

	// Update game status based on result status
	newGameStatus := game.Status
	if req.Status == "final" {
		newGameStatus = models.GameStatusCompleted
	} else if game.Status == models.GameStatusScheduled {
		newGameStatus = models.GameStatusActive
	}
	if newGameStatus != game.Status {
		h.db.Exec("UPDATE pt_event_games SET status=$1, updated_at=NOW() WHERE id=$2", string(newGameStatus), gameID)
	}

	result := models.Result{
		ID:         id,
		GameID:     gameID,
		EventID:    game.EventID,
		Entries:    req.Entries,
		Status:     req.Status,
		RecordedBy: uid,
		RecordedAt: now,
		UpdatedAt:  now,
	}

	h.hub.Broadcast(models.WSMessage{
		Type:    "result_update",
		EventID: game.EventID,
		GameID:  gameID,
		Data:    result,
	})

	if c.Request.Method == "POST" {
		c.JSON(http.StatusCreated, result)
	} else {
		c.JSON(http.StatusOK, result)
	}
}

func (h *Handler) DeleteResult(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	row := h.db.QueryRow("SELECT "+resultSelectCols+" FROM pt_event_results WHERE id=$1", id)
	result, err := scanResultRow(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "result not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), result.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.db.Exec("DELETE FROM pt_event_results WHERE id = $1", id)
	c.JSON(http.StatusOK, gin.H{"message": "result deleted"})
}
