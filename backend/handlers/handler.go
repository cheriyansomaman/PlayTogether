package handlers

import (
	"github.com/couchbase/gocb/v2"
	"github.com/playtogether/backend/models"
	ws "github.com/playtogether/backend/websocket"
)

type Handler struct {
	cluster    *gocb.Cluster
	collection *gocb.Collection
	hub        *ws.Hub
	jwtSecret  string
	bucket     string
}

func New(cluster *gocb.Cluster, collection *gocb.Collection, hub *ws.Hub, jwtSecret, bucket string) *Handler {
	return &Handler{cluster: cluster, collection: collection, hub: hub, jwtSecret: jwtSecret, bucket: bucket}
}

func queryOptions(params map[string]interface{}) *gocb.QueryOptions {
	return &gocb.QueryOptions{NamedParameters: params}
}

// getEventRole returns the caller's effective role for an event.
// System admins always get EventRoleAdmin regardless of membership.
func (h *Handler) getEventRole(userID, eventID string) (models.EventRole, bool) {
	// System admin → implicit event admin
	r, err := h.collection.Get("user::"+userID, nil)
	if err == nil {
		var u models.User
		if r.Content(&u) == nil && u.Role == models.RoleAdmin {
			return models.EventRoleAdmin, true
		}
	}

	// Check event-specific membership
	r, err = h.collection.Get(models.EventMemberKey(eventID, userID), nil)
	if err != nil {
		return "", false
	}
	var m models.EventMember
	if r.Content(&m) != nil {
		return "", false
	}
	return m.Role, true
}

// requireEventRole aborts with 403 if the caller doesn't have at least the given role.
// Role hierarchy: admin > member > viewer
func (h *Handler) hasEventRole(userID, eventID string, minimum models.EventRole) bool {
	role, ok := h.getEventRole(userID, eventID)
	if !ok {
		return false
	}
	switch minimum {
	case models.EventRoleViewer:
		return true
	case models.EventRoleMember:
		return role == models.EventRoleMember || role == models.EventRoleAdmin
	case models.EventRoleAdmin:
		return role == models.EventRoleAdmin
	}
	return false
}
