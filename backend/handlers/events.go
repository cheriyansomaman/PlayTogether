package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

// ── Scan helper ───────────────────────────────────────────────────────────────

func scanEventRow(row *sql.Row) (*models.Event, error) {
	var e models.Event
	var description, location, startDate, endDate, eventType, shareToken sql.NullString
	var logoBase64, logoURL sql.NullString
	var pointSystemJSON, joinRequestJSON, userTemplateJSON []byte

	err := row.Scan(
		&e.ID, &e.Name, &description, &location, &startDate, &endDate,
		&eventType, &e.Status, &shareToken,
		&pointSystemJSON, &joinRequestJSON, &userTemplateJSON,
		&logoBase64, &logoURL,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	e.Description = description.String
	e.Location = location.String
	e.StartDate = startDate.String
	e.EndDate = endDate.String
	e.EventType = eventType.String
	e.ShareToken = shareToken.String
	e.LogoBase64 = logoBase64.String
	e.LogoURL = logoURL.String
	jsonUnmarshal(pointSystemJSON, &e.PointSystem)
	jsonUnmarshal(joinRequestJSON, &e.JoinQuestions)
	var tmpl struct {
		Fields []models.UserTemplateField `json:"fields"`
		Unique []string                   `json:"unique"`
	}
	jsonUnmarshal(userTemplateJSON, &tmpl)
	e.UserTemplateFields = tmpl.Fields
	e.UserTemplateUnique = tmpl.Unique
	return &e, nil
}

func scanEventRows(rows *sql.Rows) (*models.Event, error) {
	var e models.Event
	var description, location, startDate, endDate, eventType, shareToken sql.NullString
	var logoBase64, logoURL sql.NullString
	var pointSystemJSON, joinRequestJSON, userTemplateJSON []byte

	err := rows.Scan(
		&e.ID, &e.Name, &description, &location, &startDate, &endDate,
		&eventType, &e.Status, &shareToken,
		&pointSystemJSON, &joinRequestJSON, &userTemplateJSON,
		&logoBase64, &logoURL,
		&e.CreatedBy, &e.CreatedAt, &e.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	e.Description = description.String
	e.Location = location.String
	e.StartDate = startDate.String
	e.EndDate = endDate.String
	e.EventType = eventType.String
	e.ShareToken = shareToken.String
	e.LogoBase64 = logoBase64.String
	e.LogoURL = logoURL.String
	jsonUnmarshal(pointSystemJSON, &e.PointSystem)
	jsonUnmarshal(joinRequestJSON, &e.JoinQuestions)
	var tmpl struct {
		Fields []models.UserTemplateField `json:"fields"`
		Unique []string                   `json:"unique"`
	}
	jsonUnmarshal(userTemplateJSON, &tmpl)
	e.UserTemplateFields = tmpl.Fields
	e.UserTemplateUnique = tmpl.Unique
	return &e, nil
}

const eventSelectCols = `id, name, description, location, start_date, end_date,
	event_type, status, share_token,
	settings_point_system, settings_join_request, settings_user_template,
	event_logo_base64, event_logo_url,
	created_by, created_at, updated_at`

// ── Request types ─────────────────────────────────────────────────────────────

type CreateEventRequest struct {
	Name        string `json:"name" binding:"required"`
	EventType   string `json:"event_type" binding:"required"`
	StartDate   string `json:"start_date" binding:"required"`
	EndDate     string `json:"end_date"`
	Location    string `json:"location"`
	Description string `json:"description"`
	LogoBase64  string `json:"logo_base64"`
	LogoURL     string `json:"logo_url"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) ListEvents(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	rows, err := h.db.Query("SELECT " + eventSelectCols + " FROM pt_events ORDER BY start_date ASC")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var mine, others []models.Event
	for rows.Next() {
		ev, err := scanEventRows(rows)
		if err != nil {
			continue
		}
		if ev.CreatedBy == uid {
			mine = append(mine, *ev)
		} else {
			others = append(others, *ev)
		}
	}

	result := append(mine, others...)
	if result == nil {
		result = []models.Event{}
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) CreateEvent(c *gin.Context) {
	var req CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	uid := userID.(string)

	var startDate, endDate, location, description, eventType interface{}
	if req.StartDate != "" {
		startDate = req.StartDate
	}
	if req.EndDate != "" {
		endDate = req.EndDate
	}
	if req.Location != "" {
		location = req.Location
	}
	if req.Description != "" {
		description = req.Description
	}
	if req.EventType != "" {
		eventType = req.EventType
	}

	var id string
	err := h.db.QueryRow(
		`INSERT INTO pt_events (name, description, location, start_date, end_date, event_type, status, event_logo_base64, event_logo_url, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, 'upcoming', $7, $8, $9) RETURNING id`,
		req.Name, description, location, startDate, endDate, eventType,
		nullableStr(req.LogoBase64), nullableStr(req.LogoURL), uid,
	).Scan(&id)
	if err != nil {
		log.Printf("create event error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create event"})
		return
	}

	// Auto-add creator as event admin
	h.db.Exec(
		`INSERT INTO pt_event_members (event_id, user_id, role, added_by)
		 VALUES ($1, $2, 'admin', $2)
		 ON CONFLICT (event_id, user_id) DO NOTHING`,
		id, uid,
	)

	// Seed default point system
	for _, rule := range models.DefaultPointSystem {
		h.db.Exec(
			`INSERT INTO pt_event_point_system (event_id, rank_name, rank_position, rank_points)
			 VALUES ($1, $2, $3, $4)`,
			id, rule.RankName, rule.Rank, rule.Points,
		)
	}

	event, err := h.getEventByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load event"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "event_created", Data: event})
	c.JSON(http.StatusCreated, event)
}

func (h *Handler) getEventPointSystem(eventID string) ([]models.PointRule, error) {
	rows, err := h.db.Query(
		`SELECT id, rank_name, rank_position, rank_points
		 FROM pt_event_point_system
		 WHERE event_id = $1
		 ORDER BY rank_position ASC`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rules []models.PointRule
	for rows.Next() {
		var r models.PointRule
		if err := rows.Scan(&r.ID, &r.RankName, &r.Rank, &r.Points); err == nil {
			rules = append(rules, r)
		}
	}
	return rules, nil
}

func (h *Handler) getEventByID(id string) (*models.Event, error) {
	row := h.db.QueryRow("SELECT "+eventSelectCols+" FROM pt_events WHERE id = $1", id)
	event, err := scanEventRow(row)
	if err != nil {
		return nil, err
	}
	// Load point system from dedicated table; fall back to JSONB if table is empty
	if ps, _ := h.getEventPointSystem(id); len(ps) > 0 {
		event.PointSystem = ps
	}
	return event, nil
}

func (h *Handler) GetEvent(c *gin.Context) {
	id := c.Param("id")
	event, err := h.getEventByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}
	c.JSON(http.StatusOK, event)
}

func (h *Handler) UpdateEvent(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var startDate, endDate interface{}
	if req.StartDate != "" {
		startDate = req.StartDate
	}
	if req.EndDate != "" {
		endDate = req.EndDate
	}

	_, err := h.db.Exec(
		`UPDATE pt_events SET name=$1, description=$2, location=$3, start_date=$4, end_date=$5, event_type=$6,
		 event_logo_base64=$7, event_logo_url=$8, updated_at=NOW()
		 WHERE id=$9`,
		req.Name, nullableStr(req.Description), nullableStr(req.Location), startDate, endDate, nullableStr(req.EventType),
		nullableStr(req.LogoBase64), nullableStr(req.LogoURL), id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update event"})
		return
	}

	event, _ := h.getEventByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "event_updated", EventID: id, Data: event})
	c.JSON(http.StatusOK, event)
}

func (h *Handler) UpdateEventStatus(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req struct {
		Status models.EventStatus `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.db.Exec("UPDATE pt_events SET status=$1, updated_at=NOW() WHERE id=$2", string(req.Status), id)

	event, _ := h.getEventByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "event_status_changed", EventID: id, Data: event})
	c.JSON(http.StatusOK, event)
}

func (h *Handler) UpdateEventSettings(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req struct {
		JoinQuestions      []models.JoinQuestion      `json:"join_questions"`
		PointSystem        []models.PointRule         `json:"point_system"`
		UserTemplateFields []models.UserTemplateField `json:"user_template_fields"`
		UserTemplateUnique []string                   `json:"user_template_unique"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tmpl := struct {
		Fields []models.UserTemplateField `json:"fields"`
		Unique []string                   `json:"unique"`
	}{Fields: req.UserTemplateFields, Unique: req.UserTemplateUnique}

	_, err := h.db.Exec(
		`UPDATE pt_events SET settings_join_request=$1, settings_user_template=$2, updated_at=NOW()
		 WHERE id=$3`,
		jsonMarshal(req.JoinQuestions), jsonMarshal(tmpl), id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update settings"})
		return
	}

	// Replace point system rows
	if _, err := h.db.Exec(`DELETE FROM pt_event_point_system WHERE event_id = $1`, id); err == nil {
		for _, rule := range req.PointSystem {
			name := rule.RankName
			if name == "" {
				name = "Rank"
			}
			h.db.Exec(
				`INSERT INTO pt_event_point_system (event_id, rank_name, rank_position, rank_points)
				 VALUES ($1, $2, $3, $4)`,
				id, name, rule.Rank, rule.Points,
			)
		}
	}

	event, _ := h.getEventByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "event_updated", EventID: id, Data: event})
	c.JSON(http.StatusOK, event)
}

func (h *Handler) DeleteEvent(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	if !h.hasEventRole(userID.(string), id, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	h.db.Exec("DELETE FROM pt_events WHERE id = $1", id)
	c.JSON(http.StatusOK, gin.H{"message": "event deleted"})
}

// nullableStr returns nil if s is empty, otherwise the string — for SQL nullable columns.
func nullableStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
