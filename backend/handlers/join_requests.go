package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

// ── Scan helper ───────────────────────────────────────────────────────────────

// joinRequestQuery selects join request columns plus user details via JOIN.
const joinRequestQuery = `
SELECT jr.id, jr.event_id, jr.user_id, jr.status, jr.questions, jr.answers,
       jr.reviewed_by, jr.reviewed_at, jr.created_at,
       u.first_name, u.last_name, u.username, u.email
FROM pt_event_join_requests jr
JOIN pt_users u ON jr.user_id = u.id`

func scanJoinRequestRow(row *sql.Row) (*models.JoinRequest, error) {
	var jr models.JoinRequest
	var reviewedBy, email sql.NullString
	var reviewedAt sql.NullTime
	var questionsJSON, answersJSON []byte

	err := row.Scan(
		&jr.ID, &jr.EventID, &jr.UserID, &jr.Status,
		&questionsJSON, &answersJSON,
		&reviewedBy, &reviewedAt, &jr.CreatedAt,
		&jr.FirstName, &jr.LastName, &jr.Username, &email,
	)
	if err != nil {
		return nil, err
	}
	jr.ReviewedBy = reviewedBy.String
	jr.Email = email.String
	if reviewedAt.Valid {
		t := reviewedAt.Time
		jr.ReviewedAt = &t
	}
	jsonUnmarshal(questionsJSON, &jr.Questions)
	jsonUnmarshal(answersJSON, &jr.Answers)
	return &jr, nil
}

func scanJoinRequestRows(rows *sql.Rows) (*models.JoinRequest, error) {
	var jr models.JoinRequest
	var reviewedBy, email sql.NullString
	var reviewedAt sql.NullTime
	var questionsJSON, answersJSON []byte

	err := rows.Scan(
		&jr.ID, &jr.EventID, &jr.UserID, &jr.Status,
		&questionsJSON, &answersJSON,
		&reviewedBy, &reviewedAt, &jr.CreatedAt,
		&jr.FirstName, &jr.LastName, &jr.Username, &email,
	)
	if err != nil {
		return nil, err
	}
	jr.ReviewedBy = reviewedBy.String
	jr.Email = email.String
	if reviewedAt.Valid {
		t := reviewedAt.Time
		jr.ReviewedAt = &t
	}
	jsonUnmarshal(questionsJSON, &jr.Questions)
	jsonUnmarshal(answersJSON, &jr.Answers)
	return &jr, nil
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) RequestToJoin(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")
	uid := userID.(string)

	// Already a member
	var isMember bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_event_members WHERE event_id=$1 AND user_id=$2)", eventID, uid).Scan(&isMember)
	if isMember {
		c.JSON(http.StatusConflict, gin.H{"error": "already a member of this event"})
		return
	}

	// Check for existing request
	var existingStatus string
	var existingID string
	h.db.QueryRow("SELECT id, status FROM pt_event_join_requests WHERE event_id=$1 AND user_id=$2", eventID, uid).Scan(&existingID, &existingStatus)

	if existingID != "" {
		if existingStatus == string(models.JoinRequestPending) {
			row := h.db.QueryRow(joinRequestQuery+" WHERE jr.id=$1", existingID)
			jr, err := scanJoinRequestRow(row)
			if err == nil {
				c.JSON(http.StatusOK, jr)
			}
			return
		}
		// Delete rejected/approved request so user can re-apply
		h.db.Exec("DELETE FROM pt_event_join_requests WHERE id=$1", existingID)
	}

	var body struct {
		Answers map[string]string `json:"answers"`
	}
	c.ShouldBindJSON(&body)

	// Get join questions from event settings
	var questions []models.JoinQuestion
	var questionsJSON []byte
	h.db.QueryRow("SELECT settings_join_request FROM pt_events WHERE id=$1", eventID).Scan(&questionsJSON)
	jsonUnmarshal(questionsJSON, &questions)
	if len(questions) == 0 {
		questions = models.DefaultJoinQuestions
	}

	var id string
	err := h.db.QueryRow(
		`INSERT INTO pt_event_join_requests (event_id, user_id, status, questions, answers)
		 VALUES ($1, $2, 'pending', $3, $4) RETURNING id`,
		eventID, uid, jsonMarshal(questions), jsonMarshal(body.Answers),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to submit request"})
		return
	}

	// Persist personal details from answers to pt_users
	if len(body.Answers) > 0 {
		ageStr := body.Answers["age"]
		var age interface{}
		if ageStr != "" {
			var ageInt int
			fmt.Sscanf(ageStr, "%d", &ageInt)
			if ageInt > 0 {
				age = ageInt
			}
		}
		h.db.Exec(
			`UPDATE pt_users SET
			   email   = COALESCE(NULLIF($1,''), email),
			   age     = COALESCE($2, age),
			   phone   = COALESCE(NULLIF($3,''), phone),
			   address = COALESCE(NULLIF($4,''), address),
			   tags    = COALESCE(NULLIF($5,''), tags),
			   updated_at = NOW()
			 WHERE id = $6`,
			nullableStr(body.Answers["email"]), age,
			nullableStr(body.Answers["phone"]), nullableStr(body.Answers["address"]),
			nullableStr(body.Answers["tags"]), uid,
		)
	}

	row := h.db.QueryRow(joinRequestQuery+" WHERE jr.id=$1", id)
	jr, err := scanJoinRequestRow(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load join request"})
		return
	}
	jr.Questions = questions
	jr.Answers = body.Answers

	h.hub.Broadcast(models.WSMessage{Type: "join_request", EventID: eventID, Data: jr})
	c.JSON(http.StatusCreated, jr)
}

func (h *Handler) GetMyJoinRequest(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")

	row := h.db.QueryRow(
		joinRequestQuery+" WHERE jr.event_id=$1 AND jr.user_id=$2",
		eventID, userID.(string),
	)
	jr, err := scanJoinRequestRow(row)
	if err != nil {
		c.JSON(http.StatusOK, nil)
		return
	}
	c.JSON(http.StatusOK, jr)
}

func (h *Handler) GetJoinRequests(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	rows, err := h.db.Query(
		joinRequestQuery+" WHERE jr.event_id=$1 AND jr.status='pending' ORDER BY jr.created_at ASC",
		eventID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	requests := []models.JoinRequest{}
	for rows.Next() {
		jr, err := scanJoinRequestRows(rows)
		if err != nil {
			continue
		}
		requests = append(requests, *jr)
	}
	c.JSON(http.StatusOK, requests)
}

func (h *Handler) ReviewJoinRequest(c *gin.Context) {
	eventID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req struct {
		Status   models.JoinRequestStatus `json:"status" binding:"required"`
		Role     models.EventRole         `json:"role"`
		TeamName string                   `json:"team_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Status != models.JoinRequestApproved && req.Status != models.JoinRequestRejected {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be approved or rejected"})
		return
	}

	row := h.db.QueryRow(
		joinRequestQuery+" WHERE jr.event_id=$1 AND jr.user_id=$2",
		eventID, targetUserID,
	)
	jr, err := scanJoinRequestRow(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "join request not found"})
		return
	}

	now := time.Now().UTC()
	h.db.Exec(
		`UPDATE pt_event_join_requests SET status=$1, reviewed_by=$2, reviewed_at=$3, updated_at=NOW()
		 WHERE event_id=$4 AND user_id=$5`,
		string(req.Status), callerID.(string), now, eventID, targetUserID,
	)
	jr.Status = req.Status
	jr.ReviewedBy = callerID.(string)
	jr.ReviewedAt = &now

	if req.Status == models.JoinRequestApproved {
		role := req.Role
		if role == "" {
			role = models.EventRoleViewer
		}

		h.db.Exec(
			`INSERT INTO pt_event_members (event_id, user_id, role, team_name, added_by)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (event_id, user_id) DO NOTHING`,
			eventID, targetUserID, string(role), nullableStr(req.TeamName), callerID.(string),
		)

		memberRow := h.db.QueryRow(memberQuery+" WHERE em.event_id=$1 AND em.user_id=$2", eventID, targetUserID)
		if m, err := scanMemberRow(memberRow); err == nil {
			h.hub.Broadcast(models.WSMessage{Type: "member_added", EventID: eventID, Data: m})
		}
	}

	h.hub.Broadcast(models.WSMessage{Type: "join_request_reviewed", EventID: eventID, Data: jr})
	c.JSON(http.StatusOK, jr)
}
