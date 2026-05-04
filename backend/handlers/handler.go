package handlers

import (
	"database/sql"
	"encoding/json"

	"github.com/playtogether/backend/models"
	ws "github.com/playtogether/backend/websocket"
)

type Handler struct {
	db        *sql.DB
	hub       *ws.Hub
	jwtSecret string
}

func New(db *sql.DB, hub *ws.Hub, jwtSecret string) *Handler {
	return &Handler{db: db, hub: hub, jwtSecret: jwtSecret}
}

// jsonMarshal marshals v to JSON bytes, returning nil on error.
func jsonMarshal(v interface{}) []byte {
	if v == nil {
		return nil
	}
	b, _ := json.Marshal(v)
	return b
}

// jsonUnmarshal unmarshals src into dst if src is non-nil.
func jsonUnmarshal(src []byte, dst interface{}) {
	if src != nil {
		json.Unmarshal(src, dst)
	}
}

// getEventRole returns the caller's role for the given event from pt_event_members.
func (h *Handler) getEventRole(userID, eventID string) (models.EventRole, bool) {
	var eventRole models.EventRole
	err := h.db.QueryRow(
		"SELECT role FROM pt_event_members WHERE event_id = $1 AND user_id = $2",
		eventID, userID,
	).Scan(&eventRole)
	if err != nil {
		return "", false
	}
	return eventRole, true
}

// hasEventRole checks whether caller has at least the given role in the event.
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
