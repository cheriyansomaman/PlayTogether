package handlers

import (
	"database/sql"
	"net/http"
	"sort"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
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

func (h *Handler) GetDashboard(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	empty := DashboardResponse{
		MyEvents:         []MyEventSummary{},
		MyParticipations: []MyParticipation{},
		TeamLeaderboard:  []TeamScore{},
		TopIndividuals:   []IndividualScore{},
	}

	// ── 1. Events I'm a member of ─────────────────────────────────────────────
	evRows, err := h.db.Query(`
		SELECT e.id, e.name, e.description, e.location, e.start_date, e.end_date,
		       e.event_type, e.status, e.share_token,
		       e.settings_point_system, e.settings_join_request, e.settings_user_template,
		       e.created_by, e.created_at, e.updated_at, em.role
		FROM pt_events e
		JOIN pt_event_members em ON e.id = em.event_id
		WHERE em.user_id = $1
		ORDER BY e.created_at DESC
	`, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load events"})
		return
	}

	var myEvents []MyEventSummary
	eventMap := map[string]models.Event{}
	eventIDs := []string{}

	for evRows.Next() {
		var e models.Event
		var desc, loc, sd, ed, eType, token sql.NullString
		var psJSON, jrJSON, utJSON []byte
		var role string

		if err := evRows.Scan(
			&e.ID, &e.Name, &desc, &loc, &sd, &ed,
			&eType, &e.Status, &token,
			&psJSON, &jrJSON, &utJSON,
			&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
			&role,
		); err != nil {
			continue
		}
		e.Description = desc.String
		e.Location = loc.String
		e.StartDate = sd.String
		e.EndDate = ed.String
		e.EventType = eType.String
		e.ShareToken = token.String
		jsonUnmarshal(psJSON, &e.PointSystem)
		jsonUnmarshal(jrJSON, &e.JoinQuestions)
		var tmpl struct {
			Fields []models.UserTemplateField `json:"fields"`
			Unique []string                   `json:"unique"`
		}
		jsonUnmarshal(utJSON, &tmpl)
		e.UserTemplateFields = tmpl.Fields
		e.UserTemplateUnique = tmpl.Unique

		myEvents = append(myEvents, MyEventSummary{Event: e, Role: role})
		eventMap[e.ID] = e
		eventIDs = append(eventIDs, e.ID)
	}
	evRows.Close()

	if len(eventIDs) == 0 {
		c.JSON(http.StatusOK, empty)
		return
	}

	// ── 2. All results across my events ───────────────────────────────────────
	var allResults []models.Result
	resRows, err := h.db.Query(
		"SELECT "+resultSelectCols+" FROM pt_event_results WHERE event_id = ANY($1)",
		pq.Array(eventIDs),
	)
	if err == nil {
		for resRows.Next() {
			r, err := scanResultRows(resRows)
			if err == nil {
				allResults = append(allResults, *r)
			}
		}
		resRows.Close()
	}

	// ── 3. My participations (matched by email) ────────────────────────────────
	var myParticipations []MyParticipation

	// ── 4. Team leaderboard ───────────────────────────────────────────────────
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
	for key, ts := range teamScores {
		if ts.TeamID != "" {
			team, err := h.getTeamByID(ts.TeamID)
			if err == nil {
				teamScores[key].TeamColor = team.Color
				teamScores[key].TeamName = team.Name
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

	// ── 5. Top 3 individuals ──────────────────────────────────────────────────
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
