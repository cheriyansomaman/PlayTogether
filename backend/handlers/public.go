package handlers

import (
	"database/sql"
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

// GenerateShareLink creates (or returns existing) a share token for an event.
func (h *Handler) GenerateShareLink(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	// Check if event exists and has a token already
	var existingToken sql.NullString
	err := h.db.QueryRow("SELECT share_token FROM pt_events WHERE id = $1", eventID).Scan(&existingToken)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	if existingToken.Valid && existingToken.String != "" {
		c.JSON(http.StatusOK, gin.H{"token": existingToken.String})
		return
	}

	// Generate new token
	var token string
	if err = h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		return tx.QueryRow(
			`UPDATE pt_events SET share_token = gen_random_uuid()::text, updated_at = NOW()
			 WHERE id = $1 RETURNING share_token`,
			eventID,
		).Scan(&token)
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate share link"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": token})
}

// RevokeShareLink removes the share token so the old URL stops working.
func (h *Handler) RevokeShareLink(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var rowsAffected int64
	if err := h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		res, err := tx.Exec("UPDATE pt_events SET share_token = NULL, updated_at = NOW() WHERE id = $1", eventID)
		if err != nil {
			return err
		}
		rowsAffected, _ = res.RowsAffected()
		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to revoke share link"})
		return
	}
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "share link revoked"})
}

// PublicEventData is the payload returned to anyone with the share link.
type PublicEventData struct {
	Event   models.Event    `json:"event"`
	Games   []models.Game   `json:"games"`
	Teams   []models.Team   `json:"teams"`
	Results []models.Result `json:"results"`
}

// GetPublicEvent serves event data to unauthenticated visitors via share token.
func (h *Handler) GetPublicEvent(c *gin.Context) {
	token := c.Param("token")

	// Look up event by share token
	row := h.db.QueryRow("SELECT "+eventSelectCols+" FROM pt_events WHERE share_token = $1", token)
	event, err := scanEventRow(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid or expired share link"})
		return
	}

	eventID := event.ID

	// Load games
	gRows, _ := h.db.Query(
		"SELECT "+gameSelectCols+" FROM pt_event_games WHERE event_id = $1 ORDER BY scheduled_at ASC NULLS LAST",
		eventID,
	)
	games := []models.Game{}
	if gRows != nil {
		defer gRows.Close()
		for gRows.Next() {
			g, err := scanGameRows(gRows)
			if err == nil {
				games = append(games, *g)
			}
		}
	}

	// Load teams
	tRows, _ := h.db.Query(
		"SELECT id, event_id, name, description, logo_url, logo_base64, color, created_by, created_at FROM pt_event_teams WHERE event_id = $1 ORDER BY name ASC",
		eventID,
	)
	teams := []models.Team{}
	if tRows != nil {
		defer tRows.Close()
		for tRows.Next() {
			t, err := scanTeamRows(tRows)
			if err == nil {
				teams = append(teams, *t)
			}
		}
	}

	// Load results
	rRows, _ := h.db.Query(
		"SELECT "+resultSelectCols+" FROM pt_event_results WHERE event_id = $1 ORDER BY updated_at DESC",
		eventID,
	)
	results := []models.Result{}
	if rRows != nil {
		defer rRows.Close()
		for rRows.Next() {
			r, err := scanResultRows(rRows)
			if err == nil {
				results = append(results, *r)
			}
		}
	}

	c.JSON(http.StatusOK, PublicEventData{
		Event:   *event,
		Games:   games,
		Teams:   teams,
		Results: results,
	})
}

// teamLeaderboardFromResults aggregates team scores across all results.
func teamLeaderboardFromResults(results []models.Result, teamMap map[string]models.Team) []TeamScore {
	scores := map[string]*TeamScore{}
	for _, r := range results {
		for _, entry := range r.Entries {
			if entry.ParticipantType != "team" {
				continue
			}
			key := entry.ParticipantID
			if key == "" {
				key = entry.ParticipantName
			}
			if _, ok := scores[key]; !ok {
				ts := &TeamScore{TeamID: entry.ParticipantID, TeamName: entry.ParticipantName}
				if t, ok := teamMap[entry.ParticipantID]; ok {
					ts.TeamName = t.Name
					ts.TeamColor = t.Color
				}
				scores[key] = ts
			}
			scores[key].TotalScore += entry.Score
			scores[key].GameCount++
			if entry.Position == 1 {
				scores[key].Wins++
			}
		}
	}
	out := make([]TeamScore, 0, len(scores))
	for _, ts := range scores {
		out = append(out, *ts)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TotalScore > out[j].TotalScore })
	return out
}

// individualLeaderboardFromResults returns top N individual performers.
func individualLeaderboardFromResults(results []models.Result, limit int) []IndividualScore {
	scores := map[string]*IndividualScore{}
	for _, r := range results {
		for _, entry := range r.Entries {
			if entry.ParticipantType == "team" {
				continue
			}
			key := entry.ParticipantName
			if key == "" {
				key = entry.ParticipantID
			}
			if _, ok := scores[key]; !ok {
				scores[key] = &IndividualScore{Name: key}
			}
			scores[key].TotalScore += entry.Score
			scores[key].GameCount++
			if entry.Position == 1 {
				scores[key].Wins++
			}
		}
	}
	out := make([]IndividualScore, 0, len(scores))
	for _, is := range scores {
		out = append(out, *is)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TotalScore > out[j].TotalScore })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out
}
