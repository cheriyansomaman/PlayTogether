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

func (h *Handler) ListGames(c *gin.Context) {
	eventID := c.Param("id")
	query := fmt.Sprintf(`SELECT g.* FROM `+"`"+`%s`+"`"+` AS g WHERE g.event_id = $event_id AND g.type = 'game' ORDER BY g.scheduled_at ASC`, h.bucket)
	rows, err := h.cluster.Query(query, queryOptions(map[string]interface{}{"event_id": eventID}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	var games []models.Game
	for rows.Next() {
		var g models.Game
		if err := rows.Row(&g); err != nil {
			continue
		}
		games = append(games, g)
	}

	if games == nil {
		games = []models.Game{}
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

	if _, err := h.collection.Get("event::"+eventID, nil); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	var req CreateGameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	now := time.Now().UTC()

	gameMode := req.GameMode
	if gameMode != "team" {
		gameMode = "individual"
	}

	game := models.Game{
		ID:             uuid.New().String(),
		Type:           "game",
		EventID:        eventID,
		Name:           req.Name,
		Description:    req.Description,
		GameType:       req.GameType,
		GameMode:       gameMode,
		ScheduledAt:    req.ScheduledAt,
		Venue:          req.Venue,
		AgeRestricted:  req.AgeRestricted,
		AgeFrom:        req.AgeFrom,
		AgeTo:          req.AgeTo,
		TeamIDs:        req.TeamIDs,
		ParticipantIDs: req.ParticipantIDs,
		Status:         models.GameStatusScheduled,
		CreatedBy:      userID.(string),
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	_, err := h.collection.Insert("game::"+game.ID, game, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create game"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "game_created", EventID: eventID, Data: game})
	c.JSON(http.StatusCreated, game)
}

func (h *Handler) GetGame(c *gin.Context) {
	id := c.Param("id")
	result, err := h.collection.Get("game::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	var game models.Game
	if err := result.Content(&game); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse game"})
		return
	}

	c.JSON(http.StatusOK, game)
}

func (h *Handler) UpdateGame(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("game::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	var game models.Game
	if err := result.Content(&game); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse game"})
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

	game.Name = req.Name
	game.Description = req.Description
	game.GameType = req.GameType
	game.GameMode = gameMode
	game.ScheduledAt = req.ScheduledAt
	game.Venue = req.Venue
	game.AgeRestricted = req.AgeRestricted
	game.AgeFrom = req.AgeFrom
	game.AgeTo = req.AgeTo
	game.TeamIDs = req.TeamIDs
	game.ParticipantIDs = req.ParticipantIDs
	game.UpdatedAt = time.Now().UTC()

	_, err = h.collection.Replace("game::"+id, game, &gocb.ReplaceOptions{Cas: result.Cas()})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update game"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "game_updated", EventID: game.EventID, GameID: id, Data: game})
	c.JSON(http.StatusOK, game)
}

func (h *Handler) UpdateGameStatus(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("game::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	var game models.Game
	if err := result.Content(&game); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse game"})
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

	game.Status = req.Status
	game.UpdatedAt = time.Now().UTC()

	_, err = h.collection.Replace("game::"+id, game, &gocb.ReplaceOptions{Cas: result.Cas()})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update game"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "game_status_changed", EventID: game.EventID, GameID: id, Data: game})
	c.JSON(http.StatusOK, game)
}

func (h *Handler) DeleteGame(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("game::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	var game models.Game
	result.Content(&game)

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.collection.Remove("game::"+id, nil)
	c.JSON(http.StatusOK, gin.H{"message": "game deleted"})
}
