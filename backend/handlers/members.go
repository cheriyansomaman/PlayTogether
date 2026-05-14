package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

func computeMemberAliases(m *models.EventMember) {
	m.UserName = strings.TrimSpace(m.FirstName + " " + m.LastName)
	m.UserEmail = m.Email
	m.CreatedAt = m.JoinedAt
}

// ── Scan helper ───────────────────────────────────────────────────────────────

// memberQuery selects event member columns plus user details via JOIN.
const memberQuery = `
SELECT em.id, em.event_id, em.user_id, em.role, em.team_id, em.added_by, em.joined_at,
       u.first_name, u.last_name, u.username, u.email, u.age, u.address, u.phone, u.tags,
       u.profile_picture,
       t.name AS team_name
FROM pt_event_members em
JOIN pt_users u ON em.user_id = u.id
LEFT JOIN pt_event_teams t ON em.team_id = t.id`

func scanMemberRow(row *sql.Row) (*models.EventMember, error) {
	var m models.EventMember
	var teamID, addedBy, email, address, phone, tags, profilePicture, teamName sql.NullString
	var age sql.NullInt64

	err := row.Scan(
		&m.ID, &m.EventID, &m.UserID, &m.Role, &teamID, &addedBy, &m.JoinedAt,
		&m.FirstName, &m.LastName, &m.Username, &email, &age, &address, &phone, &tags,
		&profilePicture, &teamName,
	)
	if err != nil {
		return nil, err
	}
	m.TeamID = teamID.String
	m.TeamName = teamName.String
	m.AddedBy = addedBy.String
	m.Email = email.String
	m.Age = int(age.Int64)
	m.Address = address.String
	m.Phone = phone.String
	m.Tags = tags.String
	m.ProfilePicture = profilePicture.String
	computeMemberAliases(&m)
	return &m, nil
}

func scanMemberRows(rows *sql.Rows) (*models.EventMember, error) {
	var m models.EventMember
	var teamID, addedBy, email, address, phone, tags, profilePicture, teamName sql.NullString
	var age sql.NullInt64

	err := rows.Scan(
		&m.ID, &m.EventID, &m.UserID, &m.Role, &teamID, &addedBy, &m.JoinedAt,
		&m.FirstName, &m.LastName, &m.Username, &email, &age, &address, &phone, &tags,
		&profilePicture, &teamName,
	)
	if err != nil {
		return nil, err
	}
	m.TeamID = teamID.String
	m.TeamName = teamName.String
	m.AddedBy = addedBy.String
	m.Email = email.String
	m.Age = int(age.Int64)
	m.Address = address.String
	m.Phone = phone.String
	m.Tags = tags.String
	m.ProfilePicture = profilePicture.String
	computeMemberAliases(&m)
	return &m, nil
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) GetEventMembers(c *gin.Context) {
	eventID := c.Param("id")

	rows, err := h.db.Query(memberQuery+" WHERE em.event_id = $1 ORDER BY em.joined_at ASC", eventID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	members := []models.EventMember{}
	for rows.Next() {
		m, err := scanMemberRows(rows)
		if err != nil {
			continue
		}
		members = append(members, *m)
	}
	c.JSON(http.StatusOK, members)
}

func (h *Handler) GetMyEventRole(c *gin.Context) {
	eventID := c.Param("id")
	userID, _ := c.Get("user_id")

	role, ok := h.getEventRole(userID.(string), eventID)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"role": "none"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"role": string(role)})
}

type AddMemberRequest struct {
	Username string           `json:"username" binding:"required"`
	Role     models.EventRole `json:"role" binding:"required"`
	TeamID   string           `json:"team_id"`
}

func (h *Handler) AddEventMember(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only event admins can add members"})
		return
	}

	var req AddMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Role != models.EventRoleAdmin && req.Role != models.EventRoleMember && req.Role != models.EventRoleViewer {
		c.JSON(http.StatusBadRequest, gin.H{"error": "role must be admin, coordinator, or viewer"})
		return
	}

	target, err := h.getUserByUsername(req.Username)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no account found for that username"})
		return
	}

	if err = h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		_, err := tx.Exec(
			`INSERT INTO pt_event_members (event_id, user_id, role, team_id, added_by)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (event_id, user_id) DO UPDATE SET role = EXCLUDED.role, team_id = EXCLUDED.team_id, updated_at = NOW()`,
			eventID, target.ID, string(req.Role), nullableStr(req.TeamID), callerID.(string),
		)
		return err
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add member"})
		return
	}

	row := h.db.QueryRow(memberQuery+" WHERE em.event_id = $1 AND em.user_id = $2", eventID, target.ID)
	m, err := scanMemberRow(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load member"})
		return
	}

	h.hub.Broadcast(models.WSMessage{Type: "member_added", EventID: eventID, Data: m})
	c.JSON(http.StatusCreated, m)
}

func (h *Handler) UpdateEventMember(c *gin.Context) {
	eventID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only event admins can change roles"})
		return
	}

	var req struct {
		Role    models.EventRole `json:"role" binding:"required"`
		TeamID  string           `json:"team_id"`
		Age     int              `json:"age"`
		Address string           `json:"address"`
		Phone   string           `json:"phone"`
		Tags    string           `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		_, err := tx.Exec(
			`UPDATE pt_event_members SET role=$1, team_id=$2, updated_at=NOW()
			 WHERE event_id=$3 AND user_id=$4`,
			string(req.Role), nullableStr(req.TeamID), eventID, targetUserID,
		)
		return err
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update member"})
		return
	}

	// Mirror profile changes to the user record
	h.db.Exec(
		`UPDATE pt_users SET age=$1, address=$2, phone=$3, tags=$4, updated_at=NOW() WHERE id=$5`,
		nullableInt(req.Age), nullableStr(req.Address), nullableStr(req.Phone), nullableStr(req.Tags),
		targetUserID,
	)

	row := h.db.QueryRow(memberQuery+" WHERE em.event_id = $1 AND em.user_id = $2", eventID, targetUserID)
	m, err := scanMemberRow(row)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load member"})
		return
	}
	c.JSON(http.StatusOK, m)
}

func (h *Handler) RemoveEventMember(c *gin.Context) {
	eventID := c.Param("id")
	targetUserID := c.Param("userId")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "only event admins can remove members"})
		return
	}

	h.withAuditCtx(callerID.(string), func(tx *sql.Tx) error {
		tx.Exec("DELETE FROM pt_event_members WHERE event_id=$1 AND user_id=$2", eventID, targetUserID)
		tx.Exec("DELETE FROM pt_event_join_requests WHERE event_id=$1 AND user_id=$2", eventID, targetUserID)
		return nil
	})

	c.JSON(http.StatusOK, gin.H{"message": "member removed"})
}

// ── Bulk add ──────────────────────────────────────────────────────────────────

type BulkMemberEntry struct {
	FirstName string           `json:"first_name"`
	LastName  string           `json:"last_name"`
	Email     string           `json:"email"`
	Age       int              `json:"age"`
	Address   string           `json:"address"`
	Phone     string           `json:"phone"`
	Tags      string           `json:"tags"`
	TeamID    string           `json:"team_id"`
	Role      models.EventRole `json:"role"`
}

type BulkAddRequest struct {
	Members []BulkMemberEntry `json:"members"`
}

type BulkMemberResult struct {
	Name     string              `json:"name"`
	Username string              `json:"username"`
	Success  bool                `json:"success"`
	Message  string              `json:"message,omitempty"`
	Error    string              `json:"error,omitempty"`
	Member   *models.EventMember `json:"member,omitempty"`
}

func (h *Handler) BulkAddMembers(c *gin.Context) {
	eventID := c.Param("id")
	callerID, _ := c.Get("user_id")

	if !h.hasEventRole(callerID.(string), eventID, models.EventRoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event admin access required"})
		return
	}

	var req BulkAddRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Members) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no members provided"})
		return
	}
	if len(req.Members) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("maximum 200 members per request, got %d", len(req.Members))})
		return
	}

	validRoles := map[models.EventRole]bool{
		models.EventRoleAdmin:  true,
		models.EventRoleMember: true,
		models.EventRoleViewer: true,
	}

	results := make([]BulkMemberResult, 0, len(req.Members))

	for _, entry := range req.Members {
		fullName := strings.TrimSpace(entry.FirstName + " " + entry.LastName)
		res := BulkMemberResult{Name: fullName}

		if strings.TrimSpace(entry.FirstName) == "" || strings.TrimSpace(entry.LastName) == "" {
			res.Error = "first name and last name are required"
			results = append(results, res)
			continue
		}

		role := entry.Role
		if !validRoles[role] {
			role = models.EventRoleMember
		}

		username := h.ensureUniqueUsername(usernameBase(entry.FirstName, entry.LastName))
		res.Username = username

		var emailArg interface{}
		if entry.Email != "" {
			emailArg = entry.Email
		}

		var userID string
		err := h.db.QueryRow(
			`INSERT INTO pt_users (username, first_name, last_name, email, age, address, phone, tags)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
			username, entry.FirstName, entry.LastName, emailArg,
			nullableInt(entry.Age), nullableStr(entry.Address), nullableStr(entry.Phone), nullableStr(entry.Tags),
		).Scan(&userID)
		if err != nil {
			res.Error = "failed to create user account"
			results = append(results, res)
			continue
		}

		_, err = h.db.Exec(
			`INSERT INTO pt_event_members (event_id, user_id, role, team_id, added_by)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT (event_id, user_id) DO NOTHING`,
			eventID, userID, string(role), nullableStr(entry.TeamID), callerID.(string),
		)
		if err != nil {
			h.db.Exec("DELETE FROM pt_users WHERE id = $1", userID)
			res.Error = "failed to add member"
			results = append(results, res)
			continue
		}

		now := time.Now().UTC()
		var teamName string
		if entry.TeamID != "" {
			h.db.QueryRow("SELECT name FROM pt_event_teams WHERE id = $1", entry.TeamID).Scan(&teamName)
		}
		member := &models.EventMember{
			EventID:   eventID,
			UserID:    userID,
			TeamID:    entry.TeamID,
			TeamName:  teamName,
			Role:      role,
			AddedBy:   callerID.(string),
			JoinedAt:  now,
			FirstName: entry.FirstName,
			LastName:  entry.LastName,
			Username:  username,
			Email:     entry.Email,
			Age:       entry.Age,
			Address:   entry.Address,
			Phone:     entry.Phone,
			Tags:      entry.Tags,
		}
		computeMemberAliases(member)

		h.hub.Broadcast(models.WSMessage{Type: "member_added", EventID: eventID, Data: member})
		res.Success = true
		res.Message = "added"
		res.Member = member
		results = append(results, res)
	}

	c.JSON(http.StatusOK, gin.H{"results": results})
}

// nullableInt returns nil if i is zero, otherwise the int.
func nullableInt(i int) interface{} {
	if i == 0 {
		return nil
	}
	return i
}
