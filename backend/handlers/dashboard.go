package handlers

import (
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

type MyEventSummary struct {
	Event models.Event `json:"event"`
	Role  string       `json:"role"`
}

type MyParticipation struct {
	Game      models.Game `json:"game"`
	EventName string      `json:"event_name"`
	Position  int         `json:"position"`
	Score     float64     `json:"score"`
}

type TeamScore struct {
	TeamID     string  `json:"team_id"`
	TeamName   string  `json:"team_name"`
	TeamColor  string  `json:"team_color"`
	TotalScore float64 `json:"total_score"`
	Wins       int     `json:"wins"`
	GameCount  int     `json:"game_count"`
}

type IndividualScore struct {
	Name       string  `json:"name"`
	TotalScore float64 `json:"total_score"`
	Wins       int     `json:"wins"`
	GameCount  int     `json:"game_count"`
}

type DashboardResponse struct {
	MyEvents         []MyEventSummary  `json:"my_events"`
	MyParticipations []MyParticipation `json:"my_participations"`
	TeamLeaderboard  []TeamScore       `json:"team_leaderboard"`
	TopIndividuals   []IndividualScore `json:"top_individuals"`
}

// inList builds a literal SQL IN clause value — avoids array named-parameter issues.
func inList(ids []string) string {
	quoted := make([]string, len(ids))
	for i, id := range ids {
		quoted[i] = `"` + strings.ReplaceAll(id, `"`, `\"`) + `"`
	}
	return "[" + strings.Join(quoted, ",") + "]"
}

func (h *Handler) GetDashboard(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	empty := DashboardResponse{
		MyEvents:         []MyEventSummary{},
		MyParticipations: []MyParticipation{},
		TeamLeaderboard:  []TeamScore{},
		TopIndividuals:   []IndividualScore{},
	}

	// Load user profile for email-based participant lookup
	ur, err := h.collection.Get("user::"+uid, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load user"})
		return
	}
	var u models.User
	ur.Content(&u)

	// ── 1. All events (reuses the working ListEvents query) ───────────────────
	evQ := fmt.Sprintf(
		"SELECT e.* FROM `%s` AS e WHERE e.type = 'event' ORDER BY e.created_at DESC",
		h.bucket,
	)
	evRows, err := h.cluster.Query(evQ, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load events: " + err.Error()})
		return
	}
	defer evRows.Close()

	var allEvents []models.Event
	for evRows.Next() {
		var ev models.Event
		if evRows.Row(&ev) == nil {
			allEvents = append(allEvents, ev)
		}
	}

	// ── 2. KV-check membership for each event ─────────────────────────────────
	// Uses EventMemberKey which is the same pattern already used everywhere.
	eventMap := map[string]models.Event{}
	var myEvents []MyEventSummary
	var eventIDs []string

	for _, ev := range allEvents {
		res, err := h.collection.Get(models.EventMemberKey(ev.ID, uid), nil)
		if err != nil {
			continue // not a member
		}
		var m models.EventMember
		if res.Content(&m) != nil {
			continue
		}
		myEvents = append(myEvents, MyEventSummary{Event: ev, Role: string(m.Role)})
		eventIDs = append(eventIDs, ev.ID)
		eventMap[ev.ID] = ev
	}

	if len(eventIDs) == 0 {
		c.JSON(http.StatusOK, empty)
		return
	}

	eventIn := inList(eventIDs)

	// ── 3. My participations — filter by email within my events ───────────────
	partQ := fmt.Sprintf(
		"SELECT p.* FROM `%s` AS p WHERE p.type = 'participant' AND p.email = $email AND p.event_id IN %s",
		h.bucket, eventIn,
	)
	partRows, err := h.cluster.Query(partQ, queryOptions(map[string]interface{}{"email": u.Email}))
	var myParts []models.Participant
	gameIDSet := map[string]bool{}
	if err == nil {
		defer partRows.Close()
		for partRows.Next() {
			var p models.Participant
			if partRows.Row(&p) == nil {
				myParts = append(myParts, p)
				gameIDSet[p.GameID] = true
			}
		}
	}

	// ── 4. All results across my events ──────────────────────────────────────
	resQ := fmt.Sprintf(
		"SELECT r.* FROM `%s` AS r WHERE r.type = 'result' AND r.event_id IN %s",
		h.bucket, eventIn,
	)
	resRows, err := h.cluster.Query(resQ, nil)
	var allResults []models.Result
	if err == nil {
		defer resRows.Close()
		for resRows.Next() {
			var r models.Result
			if resRows.Row(&r) == nil {
				allResults = append(allResults, r)
			}
		}
	}

	// ── 5. Games I participated in — KV get each ─────────────────────────────
	gameMap := map[string]models.Game{}
	for gid := range gameIDSet {
		if gr, err := h.collection.Get("game::"+gid, nil); err == nil {
			var g models.Game
			if gr.Content(&g) == nil {
				gameMap[gid] = g
			}
		}
	}

	// ── 6. Build participation summaries ──────────────────────────────────────
	resultByGame := map[string]models.Result{}
	for _, r := range allResults {
		resultByGame[r.GameID] = r
	}

	var myParticipations []MyParticipation
	for _, p := range myParts {
		game, ok := gameMap[p.GameID]
		if !ok {
			continue
		}
		sum := MyParticipation{
			Game:      game,
			EventName: eventMap[game.EventID].Name,
		}
		if result, ok := resultByGame[p.GameID]; ok {
			for _, entry := range result.Entries {
				if entry.ParticipantID == p.ID || entry.ParticipantName == p.Name {
					sum.Position = entry.Position
					sum.Score = entry.Score
					break
				}
			}
		}
		myParticipations = append(myParticipations, sum)
	}
	sort.Slice(myParticipations, func(i, j int) bool {
		pi, pj := myParticipations[i].Position, myParticipations[j].Position
		if pi == 0 {
			pi = 9999
		}
		if pj == 0 {
			pj = 9999
		}
		if pi != pj {
			return pi < pj
		}
		return myParticipations[i].Score > myParticipations[j].Score
	})

	// ── 7. Team leaderboard ───────────────────────────────────────────────────
	teamScores := map[string]*TeamScore{}
	for _, result := range allResults {
		for _, entry := range result.Entries {
			if entry.ParticipantType != "team" {
				continue
			}
			key := entry.ParticipantID
			if key == "" {
				key = entry.ParticipantName
			}
			if _, ok := teamScores[key]; !ok {
				teamScores[key] = &TeamScore{TeamID: entry.ParticipantID, TeamName: entry.ParticipantName}
			}
			teamScores[key].TotalScore += entry.Score
			teamScores[key].GameCount++
			if entry.Position == 1 {
				teamScores[key].Wins++
			}
		}
	}
	// Enrich with team color via KV
	for key, ts := range teamScores {
		if ts.TeamID != "" {
			if tr, err := h.collection.Get("team::"+ts.TeamID, nil); err == nil {
				var t models.Team
				if tr.Content(&t) == nil {
					teamScores[key].TeamColor = t.Color
					teamScores[key].TeamName = t.Name
				}
			}
		}
	}
	var teamLeaderboard []TeamScore
	for _, ts := range teamScores {
		teamLeaderboard = append(teamLeaderboard, *ts)
	}
	sort.Slice(teamLeaderboard, func(i, j int) bool {
		return teamLeaderboard[i].TotalScore > teamLeaderboard[j].TotalScore
	})

	// ── 8. Top 3 individuals ──────────────────────────────────────────────────
	indScores := map[string]*IndividualScore{}
	for _, result := range allResults {
		for _, entry := range result.Entries {
			if entry.ParticipantType == "team" {
				continue
			}
			key := entry.ParticipantName
			if key == "" {
				key = entry.ParticipantID
			}
			if _, ok := indScores[key]; !ok {
				indScores[key] = &IndividualScore{Name: key}
			}
			indScores[key].TotalScore += entry.Score
			indScores[key].GameCount++
			if entry.Position == 1 {
				indScores[key].Wins++
			}
		}
	}
	var topIndividuals []IndividualScore
	for _, is := range indScores {
		topIndividuals = append(topIndividuals, *is)
	}
	sort.Slice(topIndividuals, func(i, j int) bool {
		return topIndividuals[i].TotalScore > topIndividuals[j].TotalScore
	})
	if len(topIndividuals) > 3 {
		topIndividuals = topIndividuals[:3]
	}

	if myEvents == nil {
		myEvents = []MyEventSummary{}
	}
	if myParticipations == nil {
		myParticipations = []MyParticipation{}
	}
	if teamLeaderboard == nil {
		teamLeaderboard = []TeamScore{}
	}
	if topIndividuals == nil {
		topIndividuals = []IndividualScore{}
	}

	c.JSON(http.StatusOK, DashboardResponse{
		MyEvents:         myEvents,
		MyParticipations: myParticipations,
		TeamLeaderboard:  teamLeaderboard,
		TopIndividuals:   topIndividuals,
	})
}
