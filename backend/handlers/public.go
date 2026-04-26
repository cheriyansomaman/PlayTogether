package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/couchbase/gocb/v2"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/playtogether/backend/models"
)

// shareIndexKey is the KV key for token → event_id lookup (same pattern as email index).
func shareIndexKey(token string) string { return "event_share::" + token }

// GenerateShareLink creates (or returns existing) a share token for an event.
// POST /events/:id/share
func (h *Handler) GenerateShareLink(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	result, err := h.collection.Get("event::"+eventID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	var event models.Event
	result.Content(&event)

	if event.ShareToken == "" {
		event.ShareToken = uuid.New().String()
		event.UpdatedAt = time.Now().UTC()
		h.collection.Replace("event::"+eventID, event, &gocb.ReplaceOptions{Cas: result.Cas()})
		// Store reverse-lookup index: token → event_id
		h.collection.Upsert(shareIndexKey(event.ShareToken), map[string]string{"event_id": eventID}, nil)
	}

	c.JSON(http.StatusOK, gin.H{"token": event.ShareToken})
}

// RevokeShareLink removes the share token so the old URL stops working.
// DELETE /events/:id/share
func (h *Handler) RevokeShareLink(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	result, err := h.collection.Get("event::"+eventID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	var event models.Event
	result.Content(&event)

	if event.ShareToken != "" {
		h.collection.Remove(shareIndexKey(event.ShareToken), nil)
		event.ShareToken = ""
		event.UpdatedAt = time.Now().UTC()
		h.collection.Replace("event::"+eventID, event, nil)
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
// GET /public/events/:token  (no auth middleware)
func (h *Handler) GetPublicEvent(c *gin.Context) {
	token := c.Param("token")

	// KV index lookup: token → event_id (avoids N1QL index requirement)
	idxResult, err := h.collection.Get(shareIndexKey(token), nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid or expired share link"})
		return
	}
	var idx struct {
		EventID string `json:"event_id"`
	}
	if idxResult.Content(&idx) != nil || idx.EventID == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid share link"})
		return
	}

	// Load the event
	evResult, err := h.collection.Get("event::"+idx.EventID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	var event models.Event
	evResult.Content(&event)

	eventID := idx.EventID

	// Load games
	gamesQ := fmt.Sprintf(
		"SELECT g.* FROM `%s` AS g WHERE g.event_id = $event_id AND g.type = 'game' ORDER BY g.scheduled_at ASC",
		h.bucket,
	)
	gRows, err := h.cluster.Query(gamesQ, queryOptions(map[string]interface{}{"event_id": eventID}))
	var games []models.Game
	if err == nil {
		defer gRows.Close()
		for gRows.Next() {
			var g models.Game
			if gRows.Row(&g) == nil {
				games = append(games, g)
			}
		}
	}
	if games == nil {
		games = []models.Game{}
	}

	// Load teams
	teamsQ := fmt.Sprintf(
		"SELECT t.* FROM `%s` AS t WHERE t.event_id = $event_id AND t.type = 'team' ORDER BY t.name ASC",
		h.bucket,
	)
	tRows, err := h.cluster.Query(teamsQ, queryOptions(map[string]interface{}{"event_id": eventID}))
	var teams []models.Team
	if err == nil {
		defer tRows.Close()
		for tRows.Next() {
			var t models.Team
			if tRows.Row(&t) == nil {
				teams = append(teams, t)
			}
		}
	}
	if teams == nil {
		teams = []models.Team{}
	}

	// Load results
	resQ := fmt.Sprintf(
		"SELECT r.* FROM `%s` AS r WHERE r.event_id = $event_id AND r.type = 'result' ORDER BY r.updated_at DESC",
		h.bucket,
	)
	rRows, err := h.cluster.Query(resQ, queryOptions(map[string]interface{}{"event_id": eventID}))
	var results []models.Result
	if err == nil {
		defer rRows.Close()
		for rRows.Next() {
			var r models.Result
			if rRows.Row(&r) == nil {
				results = append(results, r)
			}
		}
	}
	if results == nil {
		results = []models.Result{}
	}

	c.JSON(http.StatusOK, PublicEventData{
		Event:   event,
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
