package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/playtogether/backend/models"
)

func (h *Handler) ListGameParticipants(c *gin.Context) {
	gameID := c.Param("id")

	q := fmt.Sprintf(
		"SELECT p.* FROM `%s` AS p WHERE p.game_id = $game_id AND p.type = 'participant' ORDER BY p.name ASC",
		h.bucket,
	)
	rows, err := h.cluster.Query(q, queryOptions(map[string]interface{}{"game_id": gameID}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	var participants []models.Participant
	for rows.Next() {
		var p models.Participant
		if rows.Row(&p) == nil {
			participants = append(participants, p)
		}
	}
	if participants == nil {
		participants = []models.Participant{}
	}
	c.JSON(http.StatusOK, participants)
}

func (h *Handler) CreateGameParticipant(c *gin.Context) {
	gameID := c.Param("id")
	callerID, _ := c.Get("user_id")

	// Load game to get event_id for role check
	gameResult, err := h.collection.Get("game::"+gameID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	var game models.Game
	gameResult.Content(&game)

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleMember) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event member access required"})
		return
	}

	var req CreateParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TeamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team is required"})
		return
	}
	if _, err := h.collection.Get("team::"+req.TeamID, nil); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team not found"})
		return
	}

	if game.AgeRestricted {
		if req.Age <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("age is required for this game (allowed range: %d–%d)", game.AgeFrom, game.AgeTo)})
			return
		}
		if req.Age < game.AgeFrom || req.Age > game.AgeTo {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("participant age %d is outside the allowed range %d–%d", req.Age, game.AgeFrom, game.AgeTo)})
			return
		}
	}

	participant := models.Participant{
		ID:          uuid.New().String(),
		Type:        "participant",
		EventID:     game.EventID,
		GameID:      gameID,
		TeamID:      req.TeamID,
		Name:        req.Name,
		Email:       req.Email,
		Age:         req.Age,
		Sport:       req.Sport,
		BibNumber:   req.BibNumber,
		Nationality: req.Nationality,
		CreatedBy:   callerID.(string),
		CreatedAt:   time.Now().UTC(),
	}

	if _, err := h.collection.Insert("participant::"+participant.ID, participant, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add participant"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "participant_added", EventID: game.EventID, Data: participant})
	c.JSON(http.StatusCreated, participant)
}
