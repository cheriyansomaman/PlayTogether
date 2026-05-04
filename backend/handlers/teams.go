package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

// ── Scan helpers ──────────────────────────────────────────────────────────────

func scanTeamRows(rows *sql.Rows) (*models.Team, error) {
	var t models.Team
	var description, logoURL, logoBase64, color, createdBy sql.NullString

	err := rows.Scan(
		&t.ID, &t.EventID, &t.Name, &description,
		&logoURL, &logoBase64, &color, &createdBy, &t.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	t.Description = description.String
	t.LogoURL = logoURL.String
	t.LogoBase64 = logoBase64.String
	t.Color = color.String
	t.CreatedBy = createdBy.String
	return &t, nil
}

func (h *Handler) getTeamByID(id string) (*models.Team, error) {
	rows, err := h.db.Query(
		"SELECT id, event_id, name, description, logo_url, logo_base64, color, created_by, created_at FROM pt_event_teams WHERE id = $1",
		id,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, sql.ErrNoRows
	}
	return scanTeamRows(rows)
}

// ── Request types ─────────────────────────────────────────────────────────────

type CreateTeamRequest struct {
	Name        string `json:"name" binding:"required"`
	Color       string `json:"color"`
	Description string `json:"description"`
	LogoURL     string `json:"logo_url"`
	LogoBase64  string `json:"logo_base64"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) ListTeams(c *gin.Context) {
	eventID := c.Param("id")

	rows, err := h.db.Query(
		"SELECT id, event_id, name, description, logo_url, logo_base64, color, created_by, created_at FROM pt_event_teams WHERE event_id = $1 ORDER BY name ASC",
		eventID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	teams := []models.Team{}
	for rows.Next() {
		t, err := scanTeamRows(rows)
		if err != nil {
			continue
		}
		teams = append(teams, *t)
	}
	c.JSON(http.StatusOK, teams)
}

func (h *Handler) CreateTeam(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var exists bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_events WHERE id = $1)", eventID).Scan(&exists)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	var req CreateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var id string
	err := h.db.QueryRow(
		`INSERT INTO pt_event_teams (event_id, name, description, logo_url, logo_base64, color, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		eventID, req.Name, nullableStr(req.Description), nullableStr(req.LogoURL), nullableStr(req.LogoBase64), nullableStr(req.Color), callerID.(string),
	).Scan(&id)
	if err != nil {
		log.Printf("create team error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create team"})
		return
	}

	team, _ := h.getTeamByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "team_created", EventID: eventID, Data: team})
	c.JSON(http.StatusCreated, team)
}

func (h *Handler) GetTeam(c *gin.Context) {
	id := c.Param("id")
	team, err := h.getTeamByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}
	c.JSON(http.StatusOK, team)
}

func (h *Handler) UpdateTeam(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	team, err := h.getTeamByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), team.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req CreateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err = h.db.Exec(
		"UPDATE pt_event_teams SET name=$1, description=$2, logo_url=$3, logo_base64=$4, color=$5, updated_at=NOW() WHERE id=$6",
		req.Name, nullableStr(req.Description), nullableStr(req.LogoURL), nullableStr(req.LogoBase64), nullableStr(req.Color), id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update team"})
		return
	}

	updated, _ := h.getTeamByID(id)
	c.JSON(http.StatusOK, updated)
}

func (h *Handler) DeleteTeam(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	team, err := h.getTeamByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), team.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.db.Exec("DELETE FROM pt_event_teams WHERE id = $1", id)
	c.JSON(http.StatusOK, gin.H{"message": "team deleted"})
}
