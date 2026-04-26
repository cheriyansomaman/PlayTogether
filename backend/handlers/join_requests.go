package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/playtogether/backend/models"
)

func (h *Handler) RequestToJoin(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	// Already a member — no need to request
	if _, err := h.collection.Get(models.EventMemberKey(eventID, uid), nil); err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already a member of this event"})
		return
	}

	// If a pending request already exists return it (idempotent).
	// If a previous request was approved or rejected, delete it so the user can re-apply.
	if existing, err := h.collection.Get(models.JoinRequestKey(eventID, uid), nil); err == nil {
		var jr models.JoinRequest
		existing.Content(&jr)
		if jr.Status == models.JoinRequestPending {
			c.JSON(http.StatusOK, jr)
			return
		}
		h.collection.Remove(models.JoinRequestKey(eventID, uid), nil)
	}

	// Fetch user info for the request doc
	ur, err := h.collection.Get("user::"+uid, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load user"})
		return
	}
	var u models.User
	ur.Content(&u)

	var body struct {
		Answers map[string]string `json:"answers"`
	}
	c.ShouldBindJSON(&body)

	// Snapshot the questions in use at the time of the request
	var questions []models.JoinQuestion
	if er, err := h.collection.Get("event::"+eventID, nil); err == nil {
		var ev models.Event
		if er.Content(&ev) == nil && len(ev.JoinQuestions) > 0 {
			questions = ev.JoinQuestions
		}
	}
	if len(questions) == 0 {
		questions = models.DefaultJoinQuestions
	}

	jr := models.JoinRequest{
		ID:        uuid.New().String(),
		Type:      "join_request",
		EventID:   eventID,
		UserID:    uid,
		UserName:  u.Name,
		UserEmail: u.Email,
		Username:  u.Username,
		Status:    models.JoinRequestPending,
		Questions: questions,
		Answers:   body.Answers,
		CreatedAt: time.Now().UTC(),
	}

	if _, err := h.collection.Insert(models.JoinRequestKey(eventID, uid), jr, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit request"})
		return
	}

	// Persist answers to the user's own profile document
	if len(body.Answers) > 0 {
		u.Club = body.Answers["team"]
		u.Address = body.Answers["address"]
		u.Tags = body.Answers["tags"]
		if ageStr := body.Answers["age"]; ageStr != "" {
			fmt.Sscanf(ageStr, "%d", &u.Age)
		}
		h.collection.Upsert("user::"+uid, u, nil)
	}

	h.hub.Broadcast(models.WSMessage{Type: "join_request", EventID: eventID, Data: jr})
	c.JSON(http.StatusCreated, jr)
}

func (h *Handler) GetMyJoinRequest(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")

	result, err := h.collection.Get(models.JoinRequestKey(eventID, userID.(string)), nil)
	if err != nil {
		c.JSON(http.StatusOK, nil)
		return
	}
	var jr models.JoinRequest
	result.Content(&jr)
	c.JSON(http.StatusOK, jr)
}

func (h *Handler) GetJoinRequests(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	q := fmt.Sprintf(
		"SELECT jr.* FROM `%s` AS jr WHERE jr.event_id = $event_id AND jr.type = 'join_request' AND jr.status = 'pending' ORDER BY jr.created_at ASC",
		h.bucket,
	)
	rows, err := h.cluster.Query(q, queryOptions(map[string]interface{}{"event_id": eventID}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var requests []models.JoinRequest
	for rows.Next() {
		var jr models.JoinRequest
		if rows.Row(&jr) == nil {
			requests = append(requests, jr)
		}
	}
	if requests == nil {
		requests = []models.JoinRequest{}
	}
	c.JSON(http.StatusOK, requests)
}

func (h *Handler) ReviewJoinRequest(c *gin.Context) {
	eventID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req struct {
		Status models.JoinRequestStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status != models.JoinRequestApproved && req.Status != models.JoinRequestRejected {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be approved or rejected"})
		return
	}

	result, err := h.collection.Get(models.JoinRequestKey(eventID, targetUserID), nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "join request not found"})
		return
	}
	var jr models.JoinRequest
	result.Content(&jr)

	now := time.Now().UTC()
	jr.Status = req.Status
	jr.ReviewedBy = callerID.(string)
	jr.ReviewedAt = &now
	h.collection.Upsert(models.JoinRequestKey(eventID, targetUserID), jr, nil)

	if req.Status == models.JoinRequestApproved {
		// Load profile from user doc — it was updated when the join request was submitted
		var u models.User
		if ur, err := h.collection.Get("user::"+targetUserID, nil); err == nil {
			ur.Content(&u)
		}
		member := models.EventMember{
			ID:        uuid.New().String(),
			Type:      "event_member",
			EventID:   eventID,
			UserID:    targetUserID,
			UserName:  jr.UserName,
			UserEmail: jr.UserEmail,
			Role:      models.EventRoleViewer,
			Age:       u.Age,
			Club:      u.Club,
			Address:   u.Address,
			Phone:     u.Phone,
			Tags:      u.Tags,
			AddedBy:   callerID.(string),
			CreatedAt: now,
		}
		h.collection.Insert(models.EventMemberKey(eventID, targetUserID), member, nil)
		h.hub.Broadcast(models.WSMessage{Type: "member_added", EventID: eventID, Data: member})
	}

	h.hub.Broadcast(models.WSMessage{Type: "join_request_reviewed", EventID: eventID, Data: jr})
	c.JSON(http.StatusOK, jr)
}
