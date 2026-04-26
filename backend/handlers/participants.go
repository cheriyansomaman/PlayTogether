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

type CreateParticipantRequest struct {
	Name        string `json:"name" binding:"required"`
	Email       string `json:"email"`
	Age         int    `json:"age"`
	Sport       string `json:"sport"`
	TeamID      string `json:"team_id"`
	BibNumber   string `json:"bib_number"`
	Nationality string `json:"nationality"`
}

func (h *Handler) ListParticipants(c *gin.Context) {
	eventID := c.Param("id")
	teamID := c.Query("team_id")

	var query string
	var params map[string]interface{}

	if teamID != "" {
		query = fmt.Sprintf(`SELECT p.* FROM `+"`"+`%s`+"`"+` AS p WHERE p.event_id = $event_id AND p.team_id = $team_id AND p.type = 'participant' ORDER BY p.name ASC`, h.bucket)
		params = map[string]interface{}{"event_id": eventID, "team_id": teamID}
	} else {
		query = fmt.Sprintf(`SELECT p.* FROM `+"`"+`%s`+"`"+` AS p WHERE p.event_id = $event_id AND p.type = 'participant' ORDER BY p.name ASC`, h.bucket)
		params = map[string]interface{}{"event_id": eventID}
	}

	rows, err := h.cluster.Query(query, queryOptions(params))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	var participants []models.Participant
	for rows.Next() {
		var p models.Participant
		if err := rows.Row(&p); err != nil {
			continue
		}
		participants = append(participants, p)
	}

	if participants == nil {
		participants = []models.Participant{}
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

	if _, err := h.collection.Get("event::"+eventID, nil); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	var req CreateParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate team if provided
	if req.TeamID != "" {
		if _, err := h.collection.Get("team::"+req.TeamID, nil); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "team not found"})
			return
		}
	}

	userID, _ := c.Get("user_id")

	participant := models.Participant{
		ID:          uuid.New().String(),
		Type:        "participant",
		EventID:     eventID,
		TeamID:      req.TeamID,
		Name:        req.Name,
		Email:       req.Email,
		Age:         req.Age,
		Sport:       req.Sport,
		BibNumber:   req.BibNumber,
		Nationality: req.Nationality,
		CreatedBy:   userID.(string),
		CreatedAt:   time.Now().UTC(),
	}

	_, err := h.collection.Insert("participant::"+participant.ID, participant, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create participant"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "participant_added", EventID: eventID, Data: participant})
	c.JSON(http.StatusCreated, participant)
}

func (h *Handler) GetParticipant(c *gin.Context) {
	id := c.Param("id")
	result, err := h.collection.Get("participant::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	var p models.Participant
	if err := result.Content(&p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse participant"})
		return
	}

	c.JSON(http.StatusOK, p)
}

func (h *Handler) UpdateParticipant(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("participant::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}

	var p models.Participant
	if err := result.Content(&p); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse participant"})
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
		if _, err := h.collection.Get("team::"+req.TeamID, nil); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "team not found"})
			return
		}
	}

	p.Name = req.Name
	p.Email = req.Email
	p.Age = req.Age
	p.Sport = req.Sport
	p.TeamID = req.TeamID
	p.BibNumber = req.BibNumber
	p.Nationality = req.Nationality

	_, err = h.collection.Replace("participant::"+id, p, &gocb.ReplaceOptions{Cas: result.Cas()})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update participant"})
		return
	}

	c.JSON(http.StatusOK, p)
}

func (h *Handler) DeleteParticipant(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("participant::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "participant not found"})
		return
	}
	var p models.Participant
	result.Content(&p)

	if !h.hasEventRole(callerID.(string), p.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.collection.Remove("participant::"+id, nil)
	c.JSON(http.StatusOK, gin.H{"message": "participant deleted"})
}
