package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/couchbase/gocb/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/playtogether/backend/models"
)

type RecordResultRequest struct {
	Entries []models.ResultEntry `json:"entries" binding:"required"`
	Status  string               `json:"status"` // "partial" | "final"
}

func (h *Handler) GetGameResult(c *gin.Context) {
	gameID := c.Param("id")
	query := fmt.Sprintf(`SELECT r.* FROM `+"`"+`%s`+"`"+` AS r WHERE r.game_id = $game_id AND r.type = 'result' ORDER BY r.recorded_at DESC LIMIT 1`, h.bucket)
	rows, err := h.cluster.Query(query, queryOptions(map[string]interface{}{"game_id": gameID}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	var result models.Result
	if err := rows.One(&result); err != nil {
		c.JSON(http.StatusOK, nil)
		return
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handler) ListEventResults(c *gin.Context) {
	eventID := c.Param("id")
	query := fmt.Sprintf(`SELECT r.* FROM `+"`"+`%s`+"`"+` AS r WHERE r.event_id = $event_id AND r.type = 'result' ORDER BY r.recorded_at DESC`, h.bucket)
	rows, err := h.cluster.Query(query, queryOptions(map[string]interface{}{"event_id": eventID}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	var results []models.Result
	for rows.Next() {
		var r models.Result
		if err := rows.Row(&r); err != nil {
			continue
		}
		results = append(results, r)
	}

	if results == nil {
		results = []models.Result{}
	}
	c.JSON(http.StatusOK, results)
}

func (h *Handler) RecordResult(c *gin.Context) {
	gameID := c.Param("id")
	callerID, _ := c.Get("user_id")

	gameDoc, err := h.collection.Get("game::"+gameID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	var game models.Game
	if err := gameDoc.Content(&game); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse game"})
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

	userID, _ := c.Get("user_id")
	now := time.Now().UTC()

	// Check if result already exists for this game
	query := fmt.Sprintf(`SELECT r.* FROM `+"`"+`%s`+"`"+` AS r WHERE r.game_id = $game_id AND r.type = 'result' LIMIT 1`, h.bucket)
	rows, err := h.cluster.Query(query, queryOptions(map[string]interface{}{"game_id": gameID}))

	var existingResult models.Result
	existingFound := false
	if err == nil {
		if rows.One(&existingResult) == nil {
			existingFound = true
		}
	}

	if existingFound {
		// Update existing result
		existingResult.Entries = req.Entries
		existingResult.Status = req.Status
		existingResult.RecordedBy = userID.(string)
		existingResult.UpdatedAt = now

		_, err = h.collection.Upsert("result::"+existingResult.ID, existingResult, nil)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update result"})
			return
		}

		// If final, update game status
		if req.Status == "final" {
			game.Status = models.GameStatusCompleted
			game.UpdatedAt = now
			h.collection.Replace("game::"+gameID, game, &gocb.ReplaceOptions{Cas: gameDoc.Cas()})
		} else if game.Status == models.GameStatusScheduled {
			game.Status = models.GameStatusActive
			game.UpdatedAt = now
			h.collection.Replace("game::"+gameID, game, &gocb.ReplaceOptions{Cas: gameDoc.Cas()})
		}

		h.hub.Broadcast(models.WSMessage{
			Type:    "result_update",
			EventID: game.EventID,
			GameID:  gameID,
			Data:    existingResult,
		})
		c.JSON(http.StatusOK, existingResult)
		return
	}

	// Create new result
	result := models.Result{
		ID:         uuid.New().String(),
		Type:       "result",
		GameID:     gameID,
		EventID:    game.EventID,
		Entries:    req.Entries,
		Status:     req.Status,
		RecordedBy: userID.(string),
		RecordedAt: now,
		UpdatedAt:  now,
	}

	_, err = h.collection.Insert("result::"+result.ID, result, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record result"})
		return
	}

	// Activate game when result is first recorded
	if game.Status == models.GameStatusScheduled {
		game.Status = models.GameStatusActive
		game.UpdatedAt = now
		h.collection.Replace("game::"+gameID, game, &gocb.ReplaceOptions{Cas: gameDoc.Cas()})
	}
	if req.Status == "final" {
		game.Status = models.GameStatusCompleted
		game.UpdatedAt = now
		h.collection.Replace("game::"+gameID, game, nil)
	}

	h.hub.Broadcast(models.WSMessage{
		Type:    "result_update",
		EventID: game.EventID,
		GameID:  gameID,
		Data:    result,
	})
	c.JSON(http.StatusCreated, result)
}

func (h *Handler) DeleteResult(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("result::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "result not found"})
		return
	}
	var r models.Result
	result.Content(&r)

	if !h.hasEventRole(callerID.(string), r.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.collection.Remove("result::"+id, nil)
	c.JSON(http.StatusOK, gin.H{"message": "result deleted"})
}
