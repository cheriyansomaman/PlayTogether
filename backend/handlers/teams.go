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

type CreateTeamRequest struct {
	Name        string `json:"name" binding:"required"`
	Color       string `json:"color"`
	Description string `json:"description"`
	LogoURL     string `json:"logo_url"`
}

func (h *Handler) ListTeams(c *gin.Context) {
	eventID := c.Param("id")
	query := fmt.Sprintf(`SELECT t.* FROM `+"`"+`%s`+"`"+` AS t WHERE t.event_id = $event_id AND t.type = 'team' ORDER BY t.name ASC`, h.bucket)
	rows, err := h.cluster.Query(query, queryOptions(map[string]interface{}{"event_id": eventID}))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	var teams []models.Team
	for rows.Next() {
		var t models.Team
		if err := rows.Row(&t); err != nil {
			continue
		}
		teams = append(teams, t)
	}

	if teams == nil {
		teams = []models.Team{}
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

	if _, err := h.collection.Get("event::"+eventID, nil); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	var req CreateTeamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")

	team := models.Team{
		ID:          uuid.New().String(),
		Type:        "team",
		EventID:     eventID,
		Name:        req.Name,
		Color:       req.Color,
		Description: req.Description,
		LogoURL:     req.LogoURL,
		CreatedBy:   userID.(string),
		CreatedAt:   time.Now().UTC(),
	}

	_, err := h.collection.Insert("team::"+team.ID, team, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create team"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "team_created", EventID: eventID, Data: team})
	c.JSON(http.StatusCreated, team)
}

func (h *Handler) GetTeam(c *gin.Context) {
	id := c.Param("id")
	result, err := h.collection.Get("team::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}

	var team models.Team
	if err := result.Content(&team); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse team"})
		return
	}

	c.JSON(http.StatusOK, team)
}

func (h *Handler) UpdateTeam(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("team::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}

	var team models.Team
	if err := result.Content(&team); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse team"})
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

	team.Name = req.Name
	team.Color = req.Color
	team.Description = req.Description
	team.LogoURL = req.LogoURL

	_, err = h.collection.Replace("team::"+id, team, &gocb.ReplaceOptions{Cas: result.Cas()})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update team"})
		return
	}

	c.JSON(http.StatusOK, team)
}

func (h *Handler) DeleteTeam(c *gin.Context) {
	id := c.Param("id")
	callerID, _ := c.Get("user_id")

	result, err := h.collection.Get("team::"+id, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "team not found"})
		return
	}
	var team models.Team
	result.Content(&team)

	if !h.hasEventRole(callerID.(string), team.EventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.collection.Remove("team::"+id, nil)
	c.JSON(http.StatusOK, gin.H{"message": "team deleted"})
}
