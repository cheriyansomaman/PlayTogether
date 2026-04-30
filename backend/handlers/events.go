package handlers

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/couchbase/gocb/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/playtogether/backend/models"
)

type CreateEventRequest struct {
	Name        string `json:"name" binding:"required"`
	EventType   string `json:"event_type" binding:"required"`
	StartDate   string `json:"start_date" binding:"required"`
	EndDate     string `json:"end_date"`
	Location    string `json:"location"`
	Description string `json:"description"`
}

func (h *Handler) ListEvents(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	q := fmt.Sprintf(
		"SELECT e.* FROM `%s` AS e WHERE e.type = 'event' ORDER BY e.start_date ASC",
		h.bucket,
	)
	rows, err := h.cluster.Query(q, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var mine, others []models.Event
	for rows.Next() {
		var ev models.Event
		if rows.Row(&ev) == nil {
			if ev.CreatedBy == uid {
				mine = append(mine, ev)
			} else {
				others = append(others, ev)
			}
		}
	}

	result := append(mine, others...)
	if result == nil {
		result = []models.Event{}
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) CreateEvent(c *gin.Context) {
	var req CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	now := time.Now().UTC()

	event := models.Event{
		ID:          uuid.New().String(),
		Type:        "event",
		Name:        req.Name,
		EventType:   req.EventType,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
		Location:    req.Location,
		Description: req.Description,
		Status:      models.EventStatusUpcoming,
		CreatedBy:   userID.(string),
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if _, err := h.collection.Insert("event::"+event.ID, event, nil); err != nil {
		log.Printf("create event error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create event"})
		return
	}

	// Auto-add creator as event admin — fetch their name/email first
	var creatorName, creatorEmail string
	if r, err := h.collection.Get("user::"+userID.(string), nil); err == nil {
		var u models.User
		if r.Content(&u) == nil {
			creatorName = u.Name
			creatorEmail = u.Email
		}
	}

	member := models.EventMember{
		ID:        uuid.New().String(),
		Type:      "event_member",
		EventID:   event.ID,
		UserID:    userID.(string),
		UserName:  creatorName,
		UserEmail: creatorEmail,
		Role:      models.EventRoleAdmin,
		AddedBy:   userID.(string),
		CreatedAt: now,
	}
	h.collection.Insert(models.EventMemberKey(event.ID, userID.(string)), member, nil)

	h.hub.Broadcast(models.WSMessage{Type: "event_created", Data: event})
	c.JSON(http.StatusCreated, event)
}

func (h *Handler) GetEvent(c *gin.Context) {
	id := c.Param("id")
	result, err := h.collection.Get("event::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	var event models.Event
	if err := result.Content(&event); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse event"})
		return
	}
	c.JSON(http.StatusOK, event)
}

func (h *Handler) UpdateEvent(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	result, err := h.collection.Get("event::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	var event models.Event
	result.Content(&event)

	var req CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	event.Name = req.Name
	event.EventType = req.EventType
	event.StartDate = req.StartDate
	event.EndDate = req.EndDate
	event.Location = req.Location
	event.Description = req.Description
	event.UpdatedAt = time.Now().UTC()

	if _, err := h.collection.Replace("event::"+id, event, &gocb.ReplaceOptions{Cas: result.Cas()}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update event"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "event_updated", EventID: id, Data: event})
	c.JSON(http.StatusOK, event)
}

func (h *Handler) UpdateEventStatus(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	result, err := h.collection.Get("event::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	var event models.Event
	result.Content(&event)

	var req struct {
		Status models.EventStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	event.Status = req.Status
	event.UpdatedAt = time.Now().UTC()
	h.collection.Replace("event::"+id, event, &gocb.ReplaceOptions{Cas: result.Cas()})

	h.hub.Broadcast(models.WSMessage{Type: "event_status_changed", EventID: id, Data: event})
	c.JSON(http.StatusOK, event)
}

func (h *Handler) UpdateEventSettings(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	result, err := h.collection.Get("event::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	var event models.Event
	result.Content(&event)

	var req struct {
		JoinQuestions      []models.JoinQuestion      `json:"join_questions"`
		PointSystem        []models.PointRule         `json:"point_system"`
		UserTemplateFields []models.UserTemplateField `json:"user_template_fields"`
		UserTemplateUnique []string                   `json:"user_template_unique"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	event.JoinQuestions = req.JoinQuestions
	event.PointSystem = req.PointSystem
	event.UserTemplateFields = req.UserTemplateFields
	event.UserTemplateUnique = req.UserTemplateUnique
	event.UpdatedAt = time.Now().UTC()

	if _, err := h.collection.Replace("event::"+id, event, &gocb.ReplaceOptions{Cas: result.Cas()}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update settings"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "event_updated", EventID: id, Data: event})
	c.JSON(http.StatusOK, event)
}

func (h *Handler) DeleteEvent(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.collection.Remove("event::"+id, nil)
	c.JSON(http.StatusOK, gin.H{"message": "event deleted"})
}
