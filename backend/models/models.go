package models

import "time"

type User struct {
	ID           string    `json:"id"`
	FirstName    string    `json:"first_name,omitempty"`
	LastName     string    `json:"last_name,omitempty"`
	Name         string    `json:"name"`
	Username     string    `json:"username,omitempty"`
	PasswordHash string    `json:"password_hash,omitempty"`
	Age          int       `json:"age,omitempty"`
	Address      string    `json:"address,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type UserResponse struct {
	ID        string    `json:"id"`
	Email     string    `json:"email,omitempty"`
	Name      string    `json:"name"`
	FirstName string    `json:"first_name,omitempty"`
	LastName  string    `json:"last_name,omitempty"`
	Username  string    `json:"username,omitempty"`
	Age       int       `json:"age,omitempty"`
	Address   string    `json:"address,omitempty"`
	Phone     string    `json:"phone,omitempty"`
	Tags      string    `json:"tags,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:        u.ID,
		FirstName: u.FirstName, LastName: u.LastName, Username: u.Username,
		Age: u.Age, Address: u.Address,
		CreatedAt: u.CreatedAt,
	}
}

// ── Event-level roles ─────────────────────────────────────────────────────────

type EventRole string

const (
	EventRoleAdmin  EventRole = "admin"
	EventRoleMember EventRole = "coordinator"
	EventRoleViewer EventRole = "viewer"
)

// EventMember records a user's role and team within a specific event.
// Personal details (name, email, age, etc.) are loaded via JOIN with pt_users.
type EventMember struct {
	ID       string    `json:"id"`
	EventID  string    `json:"event_id"`
	UserID   string    `json:"user_id"`
	Role     EventRole `json:"role"`
	TeamID   string    `json:"team_id,omitempty"`
	TeamName string    `json:"team_name,omitempty"`
	AddedBy  string    `json:"added_by,omitempty"`
	JoinedAt time.Time `json:"joined_at"`
	// From pt_users
	FirstName string `json:"first_name,omitempty"`
	LastName  string `json:"last_name,omitempty"`
	Username  string `json:"username,omitempty"`
	Email     string `json:"email,omitempty"`
	Age       int    `json:"age,omitempty"`
	Address   string `json:"address,omitempty"`
	Phone     string `json:"phone,omitempty"`
	Tags      string `json:"tags,omitempty"`
	// Computed aliases used by the frontend
	UserName  string    `json:"user_name,omitempty"`
	UserEmail string    `json:"user_email,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// ── Events ────────────────────────────────────────────────────────────────────

type EventStatus string

const (
	EventStatusUpcoming  EventStatus = "upcoming"
	EventStatusActive    EventStatus = "active"
	EventStatusCompleted EventStatus = "completed"
)

// JoinQuestion defines one field shown to users when they request to join an event.
type JoinQuestion struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Type     string `json:"type"` // "text" | "number" | "textarea" | "tags"
	Required bool   `json:"required"`
}

// DefaultJoinQuestions collects the personal details needed before joining an event.
// Answers are persisted to pt_users; team assignment is decided by the organizer on approval.
var DefaultJoinQuestions = []JoinQuestion{
	{ID: "email", Label: "Email", Type: "text", Required: true},
	{ID: "age", Label: "Age", Type: "number", Required: true},
	{ID: "phone", Label: "Phone", Type: "text", Required: false},
	{ID: "address", Label: "Address", Type: "textarea", Required: true},
	{ID: "tags", Label: "Tags", Type: "tags", Required: false},
}

type PointRule struct {
	ID       string `json:"id,omitempty"`
	Rank     int    `json:"rank"`
	RankName string `json:"rank_name"`
	Points   int    `json:"points"`
}

var DefaultPointSystem = []PointRule{
	{Rank: 1, RankName: "Gold", Points: 3},
	{Rank: 2, RankName: "Silver", Points: 2},
	{Rank: 3, RankName: "Bronze", Points: 1},
}

type UserTemplateField struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Required bool   `json:"required"`
}

type Event struct {
	ID                 string              `json:"id"`
	Name               string              `json:"name"`
	Description        string              `json:"description,omitempty"`
	EventType          string              `json:"event_type"`
	Location           string              `json:"location,omitempty"`
	StartDate          string              `json:"start_date"`
	EndDate            string              `json:"end_date,omitempty"`
	Status             EventStatus         `json:"status"`
	LogoBase64         string              `json:"logo_base64,omitempty"`
	LogoURL            string              `json:"logo_url,omitempty"`
	JoinQuestions      []JoinQuestion      `json:"join_questions,omitempty"`
	PointSystem        []PointRule         `json:"point_system,omitempty"`
	UserTemplateFields []UserTemplateField `json:"user_template_fields,omitempty"`
	UserTemplateUnique []string            `json:"user_template_unique,omitempty"`
	ShareToken         string              `json:"share_token,omitempty"`
	CreatedBy          string              `json:"created_by"`
	CreatedAt          time.Time           `json:"created_at"`
	UpdatedAt          time.Time           `json:"updated_at"`
}

// ── Games ─────────────────────────────────────────────────────────────────────

type GameStatus string

const (
	GameStatusScheduled GameStatus = "scheduled"
	GameStatusActive    GameStatus = "active"
	GameStatusCompleted GameStatus = "completed"
	GameStatusCancelled GameStatus = "cancelled"
)

type Game struct {
	ID             string     `json:"id"`
	EventID        string     `json:"event_id"`
	Name           string     `json:"name"`
	Description    string     `json:"description,omitempty"`
	GameType       string     `json:"game_type"`
	GameMode       string     `json:"game_mode"` // "individual" | "team"
	ScheduledAt    string     `json:"scheduled_at,omitempty"`
	Status         GameStatus `json:"status"`
	Venue          string     `json:"venue,omitempty"`
	AgeRestricted  bool       `json:"age_restricted"`
	AgeFrom        int        `json:"age_from"`
	AgeTo          int        `json:"age_to"`
	TeamIDs        []string   `json:"team_ids,omitempty"`
	ParticipantIDs []string   `json:"participant_ids,omitempty"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// ── Teams ─────────────────────────────────────────────────────────────────────

type Team struct {
	ID          string    `json:"id"`
	EventID     string    `json:"event_id"`
	Name        string    `json:"name"`
	Color       string    `json:"color,omitempty"`
	Description string    `json:"description,omitempty"`
	LogoURL     string    `json:"logo_url,omitempty"`
	LogoBase64  string    `json:"logo_base64,omitempty"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// ── Participants ──────────────────────────────────────────────────────────────

type Participant struct {
	ID          string    `json:"id"`
	EventID     string    `json:"event_id"`
	GameID      string    `json:"game_id,omitempty"`
	TeamID      string    `json:"team_id,omitempty"`
	Name        string    `json:"name"`
	Email       string    `json:"email,omitempty"`
	Age         int       `json:"age,omitempty"`
	Sport       string    `json:"sport,omitempty"`
	BibNumber   string    `json:"bib_number,omitempty"`
	Nationality string    `json:"nationality,omitempty"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// ── Results ───────────────────────────────────────────────────────────────────

type ResultEntry struct {
	ParticipantID   string  `json:"participant_id"`
	ParticipantType string  `json:"participant_type"`
	ParticipantName string  `json:"participant_name"`
	Score           float64 `json:"score"`
	Position        int     `json:"position"`
	Time            string  `json:"time,omitempty"`
	Notes           string  `json:"notes,omitempty"`
}

type Result struct {
	ID         string        `json:"id"`
	GameID     string        `json:"game_id"`
	EventID    string        `json:"event_id"`
	Entries    []ResultEntry `json:"entries"`
	Status     string        `json:"status"`
	RecordedBy string        `json:"recorded_by"`
	RecordedAt time.Time     `json:"recorded_at"`
	UpdatedAt  time.Time     `json:"updated_at"`
}

// ── Join Requests ─────────────────────────────────────────────────────────────

type JoinRequestStatus string

const (
	JoinRequestPending  JoinRequestStatus = "pending"
	JoinRequestApproved JoinRequestStatus = "approved"
	JoinRequestRejected JoinRequestStatus = "rejected"
)

// JoinRequest stores the event join application.
// User identity details are loaded via JOIN with pt_users.
type JoinRequest struct {
	ID         string            `json:"id"`
	EventID    string            `json:"event_id"`
	UserID     string            `json:"user_id"`
	Status     JoinRequestStatus `json:"status"`
	Questions  []JoinQuestion    `json:"questions,omitempty"`
	Answers    map[string]string `json:"answers,omitempty"`
	ReviewedBy string            `json:"reviewed_by,omitempty"`
	ReviewedAt *time.Time        `json:"reviewed_at,omitempty"`
	CreatedAt  time.Time         `json:"created_at"`
	// From pt_users
	FirstName string `json:"first_name,omitempty"`
	LastName  string `json:"last_name,omitempty"`
	Username  string `json:"username,omitempty"`
	Email     string `json:"email,omitempty"`
}

// ── Role Access ───────────────────────────────────────────────────────────────

type RoleAccessRule struct {
	ID              string    `json:"id"`
	EventID         string    `json:"event_id,omitempty"`
	Action          string    `json:"action"`
	RoleAdmin       bool      `json:"role_admin"`
	RoleCoordinator bool      `json:"role_coordinator"`
	RoleViewer      bool      `json:"role_viewer"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

type WSMessage struct {
	Type    string      `json:"type"`
	EventID string      `json:"event_id,omitempty"`
	GameID  string      `json:"game_id,omitempty"`
	Data    interface{} `json:"data"`
}
