package models

import "time"

// ── System-level roles ────────────────────────────────────────────────────────

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
	RoleUser   Role = "user"
)

type User struct {
	ID           string    `json:"id"`
	Type         string    `json:"type"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	FirstName    string    `json:"first_name,omitempty"`
	LastName     string    `json:"last_name,omitempty"`
	Username     string    `json:"username,omitempty"`
	PasswordHash string    `json:"password_hash,omitempty"`
	Role         Role      `json:"role"`
	Age          int       `json:"age,omitempty"`
	Club         string    `json:"club,omitempty"`
	Address      string    `json:"address,omitempty"`
	Phone        string    `json:"phone,omitempty"`
	Tags         string    `json:"tags,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

type UserResponse struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	FirstName string    `json:"first_name,omitempty"`
	LastName  string    `json:"last_name,omitempty"`
	Username  string    `json:"username,omitempty"`
	Role      Role      `json:"role"`
	Age       int       `json:"age,omitempty"`
	Club      string    `json:"club,omitempty"`
	Address   string    `json:"address,omitempty"`
	Phone     string    `json:"phone,omitempty"`
	Tags      string    `json:"tags,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID: u.ID, Email: u.Email, Name: u.Name,
		FirstName: u.FirstName, LastName: u.LastName, Username: u.Username,
		Role: u.Role, Age: u.Age, Club: u.Club, Address: u.Address,
		Phone: u.Phone, Tags: u.Tags, CreatedAt: u.CreatedAt,
	}
}

// ── Event-level roles ─────────────────────────────────────────────────────────

type EventRole string

const (
	EventRoleAdmin  EventRole = "admin"
	EventRoleMember EventRole = "member"
	EventRoleViewer EventRole = "viewer"
)

// EventMember records a user's role within a specific event.
// KV key: event_member::{event_id}::{user_id}
type EventMember struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	EventID   string    `json:"event_id"`
	UserID    string    `json:"user_id"`
	UserName  string    `json:"user_name"`
	UserEmail string    `json:"user_email"`
	Username  string    `json:"username,omitempty"`
	Role      EventRole `json:"role"`
	Age       int       `json:"age,omitempty"`
	Club      string    `json:"club,omitempty"`
	Address   string    `json:"address,omitempty"`
	Phone     string    `json:"phone,omitempty"`
	Tags      string    `json:"tags,omitempty"`
	AddedBy   string    `json:"added_by"`
	CreatedAt time.Time `json:"created_at"`
}

func EventMemberKey(eventID, userID string) string {
	return "event_member::" + eventID + "::" + userID
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

var DefaultJoinQuestions = []JoinQuestion{
	{ID: "age", Label: "Age", Type: "number", Required: true},
	{ID: "team", Label: "Team / Club", Type: "text", Required: true},
	{ID: "address", Label: "Address", Type: "textarea", Required: true},
	{ID: "tags", Label: "Tags", Type: "tags", Required: false},
}

type PointRule struct {
	Rank   int `json:"rank"`
	Points int `json:"points"`
}

var DefaultPointSystem = []PointRule{
	{Rank: 1, Points: 3},
	{Rank: 2, Points: 2},
	{Rank: 3, Points: 1},
}

type Event struct {
	ID            string         `json:"id"`
	Type          string         `json:"type"`
	Name          string         `json:"name"`
	Description   string         `json:"description,omitempty"`
	EventType     string         `json:"event_type"`
	Location      string         `json:"location,omitempty"`
	StartDate     string         `json:"start_date"`
	EndDate       string         `json:"end_date,omitempty"`
	Status        EventStatus    `json:"status"`
	JoinQuestions []JoinQuestion `json:"join_questions,omitempty"`
	PointSystem   []PointRule    `json:"point_system,omitempty"`
	ShareToken    string         `json:"share_token,omitempty"`
	CreatedBy     string         `json:"created_by"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
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
	Type           string     `json:"type"`
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
	Type        string    `json:"type"`
	EventID     string    `json:"event_id"`
	Name        string    `json:"name"`
	Color       string    `json:"color,omitempty"`
	Description string    `json:"description,omitempty"`
	LogoURL     string    `json:"logo_url,omitempty"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// ── Participants ──────────────────────────────────────────────────────────────

type Participant struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	EventID     string    `json:"event_id"`
	GameID      string    `json:"game_id"`
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
	Type       string        `json:"type"`
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

type JoinRequest struct {
	ID         string            `json:"id"`
	Type       string            `json:"type"`
	EventID    string            `json:"event_id"`
	UserID     string            `json:"user_id"`
	UserName   string            `json:"user_name"`
	UserEmail  string            `json:"user_email"`
	Username   string            `json:"username,omitempty"`
	Status     JoinRequestStatus `json:"status"`
	Questions  []JoinQuestion    `json:"questions,omitempty"`
	Answers    map[string]string `json:"answers,omitempty"`
	ReviewedBy string            `json:"reviewed_by,omitempty"`
	ReviewedAt *time.Time        `json:"reviewed_at,omitempty"`
	CreatedAt  time.Time         `json:"created_at"`
}

func JoinRequestKey(eventID, userID string) string {
	return "join_request::" + eventID + "::" + userID
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

type WSMessage struct {
	Type    string      `json:"type"`
	EventID string      `json:"event_id,omitempty"`
	GameID  string      `json:"game_id,omitempty"`
	Data    interface{} `json:"data"`
}
