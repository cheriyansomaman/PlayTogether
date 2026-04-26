package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/playtogether/backend/models"
)

func (h *Handler) GetEventMembers(c *gin.Context) {
	eventID := c.Param("id")
	q := fmt.Sprintf(
		"SELECT em.* FROM `%s` AS em WHERE em.event_id = $event_id AND em.type = 'event_member' ORDER BY em.created_at ASC",
		h.bucket,
	)
	rows, err := h.cluster.Query(q, queryOptions(map[string]interface{}{"event_id": eventID}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var members []models.EventMember
	for rows.Next() {
		var m models.EventMember
		if rows.Row(&m) == nil {
			members = append(members, m)
		}
	}
	if members == nil {
		members = []models.EventMember{}
	}
	c.JSON(http.StatusOK, members)
}

// GetMyEventRole returns the calling user's role in the event — used by the frontend
// to decide which controls to render.
func (h *Handler) GetMyEventRole(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")

	role, ok := h.getEventRole(userID.(string), eventID)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"role": "none"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"role": string(role)})
}

type AddMemberRequest struct {
	Username string           `json:"username" binding:"required"`
	Role     models.EventRole `json:"role" binding:"required"`
}

func (h *Handler) AddEventMember(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only event admins can add members"})
		return
	}

	var req AddMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Role != models.EventRoleAdmin && req.Role != models.EventRoleMember && req.Role != models.EventRoleViewer {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be admin, member, or viewer"})
		return
	}

	target, err := h.getUserByUsername(req.Username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no account found for that username"})
		return
	}

	// Idempotent: update role if already a member
	existing, _ := h.collection.Get(models.EventMemberKey(eventID, target.ID), nil)
	if existing != nil {
		var m models.EventMember
		existing.Content(&m)
		m.Role = req.Role
		h.collection.Upsert(models.EventMemberKey(eventID, target.ID), m, nil)
		c.JSON(http.StatusOK, m)
		return
	}

	member := models.EventMember{
		ID:        uuid.New().String(),
		Type:      "event_member",
		EventID:   eventID,
		UserID:    target.ID,
		UserName:  target.Name,
		UserEmail: target.Email,
		Username:  target.Username,
		Role:      req.Role,
		AddedBy:   callerID.(string),
		CreatedAt: time.Now().UTC(),
	}

	if _, err := h.collection.Insert(models.EventMemberKey(eventID, target.ID), member, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add member"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "member_added", EventID: eventID, Data: member})
	c.JSON(http.StatusCreated, member)
}

func (h *Handler) UpdateEventMember(c *gin.Context) {
	eventID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only event admins can change roles"})
		return
	}

	var req struct {
		Role     models.EventRole `json:"role" binding:"required"`
		UserName string           `json:"user_name"`
		Age      int              `json:"age"`
		Club     string           `json:"club"`
		Address  string           `json:"address"`
		Phone    string           `json:"phone"`
		Tags     string           `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.collection.Get(models.EventMemberKey(eventID, targetUserID), nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		return
	}
	var m models.EventMember
	result.Content(&m)
	m.Role = req.Role
	if req.UserName != "" {
		m.UserName = req.UserName
	}
	m.Age = req.Age
	m.Club = req.Club
	m.Address = req.Address
	m.Phone = req.Phone
	m.Tags = req.Tags

	h.collection.Upsert(models.EventMemberKey(eventID, targetUserID), m, nil)

	// Mirror profile changes back to the user doc
	if ur, err := h.collection.Get("user::"+targetUserID, nil); err == nil {
		var u models.User
		ur.Content(&u)
		if req.UserName != "" {
			u.Name = req.UserName
		}
		u.Age = req.Age
		u.Club = req.Club
		u.Address = req.Address
		u.Phone = req.Phone
		u.Tags = req.Tags
		h.collection.Upsert("user::"+targetUserID, u, nil)
	}

	c.JSON(http.StatusOK, m)
}

func (h *Handler) RemoveEventMember(c *gin.Context) {
	eventID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only event admins can remove members"})
		return
	}

	h.collection.Remove(models.EventMemberKey(eventID, targetUserID), nil)
	// Also remove their join request so they can re-apply if needed
	h.collection.Remove(models.JoinRequestKey(eventID, targetUserID), nil)
	c.JSON(http.StatusOK, gin.H{"message": "member removed"})
}

// ── Bulk add ──────────────────────────────────────────────────────────────────

// BulkMemberEntry creates a new user account from name fields and adds them to the event.
type BulkMemberEntry struct {
	FirstName string           `json:"first_name"`
	LastName  string           `json:"last_name"`
	Age       int              `json:"age"`
	Address   string           `json:"address"`
	Club      string           `json:"club"`
	Role      models.EventRole `json:"role"`
}

type BulkAddRequest struct {
	Members []BulkMemberEntry `json:"members"`
}

type BulkMemberResult struct {
	Name     string              `json:"name"`
	Username string              `json:"username"`
	Success  bool                `json:"success"`
	Message  string              `json:"message,omitempty"`
	Error    string              `json:"error,omitempty"`
	Member   *models.EventMember `json:"member,omitempty"`
}

// BulkAddMembers creates user accounts from first/last names and adds them to an event.
// POST /events/:id/members/bulk
func (h *Handler) BulkAddMembers(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req BulkAddRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Members) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no members provided"})
		return
	}
	if len(req.Members) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("maximum 200 members per request, got %d", len(req.Members))})
		return
	}

	validRoles := map[models.EventRole]bool{
		models.EventRoleAdmin:  true,
		models.EventRoleMember: true,
		models.EventRoleViewer: true,
	}

	results := make([]BulkMemberResult, 0, len(req.Members))
	now := time.Now().UTC()

	for _, entry := range req.Members {
		fullName := strings.TrimSpace(entry.FirstName + " " + entry.LastName)
		res := BulkMemberResult{Name: fullName}

		if strings.TrimSpace(entry.FirstName) == "" || strings.TrimSpace(entry.LastName) == "" {
			res.Error = "first name and last name are required"
			results = append(results, res)
			continue
		}

		role := entry.Role
		if !validRoles[role] {
			role = models.EventRoleMember
		}

		// Generate a unique username and create the user account (no password — set on first login)
		username := h.ensureUniqueUsername(usernameBase(entry.FirstName, entry.LastName))
		res.Username = username

		userID := uuid.New().String()
		newUser := models.User{
			ID:        userID,
			Type:      "user",
			Name:      fullName,
			FirstName: entry.FirstName,
			LastName:  entry.LastName,
			Username:  username,
			Role:      models.RoleUser,
			Age:       entry.Age,
			Club:      entry.Club,
			Address:   entry.Address,
			CreatedAt: now,
		}

		if _, err := h.collection.Insert("user::"+userID, newUser, nil); err != nil {
			res.Error = "failed to create user account"
			results = append(results, res)
			continue
		}
		h.collection.Upsert(usernameIndexKey(username), map[string]string{"user_id": userID}, nil)

		member := models.EventMember{
			ID:        uuid.New().String(),
			Type:      "event_member",
			EventID:   eventID,
			UserID:    userID,
			UserName:  fullName,
			Username:  username,
			Age:       entry.Age,
			Club:      entry.Club,
			Address:   entry.Address,
			Role:      role,
			AddedBy:   callerID.(string),
			CreatedAt: now,
		}

		if _, err := h.collection.Insert(models.EventMemberKey(eventID, userID), member, nil); err != nil {
			// Roll back user creation on failure
			h.collection.Remove("user::"+userID, nil)
			h.collection.Remove(usernameIndexKey(username), nil)
			res.Error = "failed to add member"
			results = append(results, res)
			continue
		}

		h.hub.Broadcast(models.WSMessage{Type: "member_added", EventID: eventID, Data: member})
		res.Success = true
		res.Message = "added"
		res.Member = &member
		results = append(results, res)
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}
