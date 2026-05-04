package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

func (h *Handler) GetEventRoleAccess(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	// Return effective rules: per-event override preferred, fallback to global default (NULL event_id).
	rows, err := h.db.Query(`
		SELECT DISTINCT ON (action) id, event_id, action, role_admin, role_coordinator, role_viewer, created_at, updated_at
		FROM pt_event_role_access
		WHERE event_id = $1 OR event_id IS NULL
		ORDER BY action, event_id NULLS LAST`, eventID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	rules := []models.RoleAccessRule{}
	for rows.Next() {
		var r models.RoleAccessRule
		var eid *string
		if err := rows.Scan(&r.ID, &eid, &r.Action, &r.RoleAdmin, &r.RoleCoordinator, &r.RoleViewer, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		if eid != nil {
			r.EventID = *eid
		}
		rules = append(rules, r)
	}
	c.JSON(http.StatusOK, rules)
}

func (h *Handler) UpdateEventRoleAccess(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var rules []models.RoleAccessRule
	if err := c.ShouldBindJSON(&rules); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	for _, r := range rules {
		_, err := h.db.Exec(`
			INSERT INTO pt_event_role_access (event_id, action, role_admin, role_coordinator, role_viewer)
			VALUES ($1, $2, $3, $4, $5)
			ON CONFLICT (event_id, action) DO UPDATE SET
				role_admin       = EXCLUDED.role_admin,
				role_coordinator = EXCLUDED.role_coordinator,
				role_viewer      = EXCLUDED.role_viewer,
				updated_at       = NOW()`,
			eventID, r.Action, r.RoleAdmin, r.RoleCoordinator, r.RoleViewer)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update rule: " + r.Action})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "role access updated"})
}

func (h *Handler) ResetEventRoleAccess(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.db.Exec("DELETE FROM pt_event_role_access WHERE event_id = $1", eventID)
	c.JSON(http.StatusOK, gin.H{"message": "reset to defaults"})
}
