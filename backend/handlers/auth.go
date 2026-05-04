package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/playtogether/backend/middleware"
	"github.com/playtogether/backend/models"
	"golang.org/x/crypto/bcrypt"
)

// ── Scan helpers ──────────────────────────────────────────────────────────────

func applyUserNulls(u *models.User,
	id, username, firstName, lastName, passwordHash,
	address sql.NullString,
	age sql.NullInt64,
	createdAt sql.NullTime,
) {
	u.ID = id.String
	u.Username = username.String
	u.FirstName = firstName.String
	u.LastName = lastName.String
	u.PasswordHash = passwordHash.String
	u.Age = int(age.Int64)
	u.Address = address.String
	u.CreatedAt = createdAt.Time
	u.Name = strings.TrimSpace(u.FirstName + " " + u.LastName)
}

func scanUserRow(row *sql.Row) (*models.User, error) {
	var u models.User
	var id, username, firstName, lastName, passwordHash,
		address sql.NullString
	var age sql.NullInt64
	var createdAt sql.NullTime
	err := row.Scan(
		&id, &username, &firstName, &lastName, &passwordHash,
		&age, &address, &createdAt,
	)
	if err != nil {
		return nil, err
	}
	applyUserNulls(&u, id, username, firstName, lastName, passwordHash,
		address, age, createdAt)
	return &u, nil
}

func scanUserRows(rows *sql.Rows) (*models.User, error) {
	var u models.User
	var id, username, firstName, lastName, passwordHash,
		address, email, phone, tags sql.NullString
	var age sql.NullInt64
	var createdAt sql.NullTime
	err := rows.Scan(
		&id, &username, &firstName, &lastName, &passwordHash,
		&age, &address, &email, &phone, &tags, &createdAt,
	)
	if err != nil {
		return nil, err
	}
	applyUserNulls(&u, id, username, firstName, lastName, passwordHash,
		address, age, createdAt)
	return &u, nil
}

// id::text forces pq to receive the UUID as a plain text string, avoiding
// the "unsupported Scan, storing driver.Value type []byte into type *string" error
// that occurs when pq returns UUID columns in binary format.
const userSelectCols = `id::text as id, username, first_name, last_name, password_hash, age, address, created_at`

// insertUser inserts a new user and returns the full row via RETURNING.
func (h *Handler) insertUser(username, firstName, lastName, passwordHash string) (*models.User, error) {
	return h.insertUserWithEmail(username, firstName, lastName, passwordHash, nil)
}

// insertUserWithEmail inserts a new user (with optional email) and returns the full row via RETURNING.
func (h *Handler) insertUserWithEmail(username, firstName, lastName, passwordHash string, email interface{}) (*models.User, error) {
	row := h.db.QueryRow(
		`INSERT INTO pt_users (username, first_name, last_name, password_hash, email)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING `+userSelectCols,
		username, firstName, lastName, passwordHash, email,
	)
	return scanUserRow(row)
}

func (h *Handler) getUserByID(userID string) (*models.User, error) {
	row := h.db.QueryRow("SELECT "+userSelectCols+" FROM pt_users WHERE id::text = $1", userID)
	u, err := scanUserRow(row)
	if err != nil {
		log.Printf("getUserByID(%s) error: %v", userID, err)
	}
	return u, err
}

func (h *Handler) getUserByUsername(username string) (*models.User, error) {
	row := h.db.QueryRow("SELECT "+userSelectCols+" FROM pt_users WHERE username = $1", username)
	log.Printf("getUserByUsername(%s)", username)
	u, err := scanUserRow(row)
	if err != nil {
		log.Printf("getUserByUsername(%s) error: %v", username, err)
	}
	return u, err
}

func (h *Handler) getUserByEmail(email string) (*models.User, error) {
	row := h.db.QueryRow("SELECT "+userSelectCols+" FROM pt_users WHERE email = $1", email)
	return scanUserRow(row)
}

// ── Username helpers ──────────────────────────────────────────────────────────

func usernameBase(firstName, lastName string) string {
	var initials strings.Builder
	for _, word := range strings.Fields(firstName) {
		for _, r := range strings.ToLower(word) {
			if r >= 'a' && r <= 'z' {
				initials.WriteRune(r)
				break
			}
		}
	}
	lastWords := strings.Fields(strings.ToLower(lastName))
	lastWord := ""
	if len(lastWords) > 0 {
		lastWord = lastWords[len(lastWords)-1]
	}
	raw := initials.String() + lastWord
	var clean strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			clean.WriteRune(r)
		}
	}
	if clean.Len() == 0 {
		return "user"
	}
	return clean.String()
}

func (h *Handler) ensureUniqueUsername(base string) string {
	var exists bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_users WHERE username = $1)", base).Scan(&exists)
	if !exists {
		return base
	}
	for i := 0; i < 300; i++ {
		// Use time-based suffix to avoid rand import
		candidate := base + strings.Replace(time.Now().Format("0405"), ":", "", -1)
		h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_users WHERE username = $1)", candidate).Scan(&exists)
		if !exists {
			return candidate
		}
	}
	return base + time.Now().Format("150405")
}

func splitName(fullName string) (string, string) {
	words := strings.Fields(fullName)
	if len(words) == 0 {
		return "", ""
	}
	if len(words) == 1 {
		return words[0], ""
	}
	return strings.Join(words[:len(words)-1], " "), words[len(words)-1]
}

// ── Request/response types ────────────────────────────────────────────────────

type RegisterRequest struct {
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
	Username  string `json:"username"`
	Password  string `json:"password" binding:"required,min=6"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type CheckUsernameRequest struct {
	Username string `json:"username" binding:"required"`
}

type PreviewUsernameRequest struct {
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
}

type SetPasswordRequest struct {
	Username        string `json:"username" binding:"required"`
	Password        string `json:"password" binding:"required,min=6"`
	ConfirmPassword string `json:"confirm_password" binding:"required"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (h *Handler) CheckUsername(c *gin.Context) {
	var req CheckUsernameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	username := strings.ToLower(strings.TrimPrefix(req.Username, "@"))
	user, err := h.getUserByUsername(username)
	if err != nil {
		if err.Error() == "sql: no rows in result set" {
			c.JSON(http.StatusOK, gin.H{"exists": false, "has_password": false})
		} else {
			// Surface scan/query errors so they are visible during development.
			log.Printf("CheckUsername scan error for %q: %v", username, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"exists": true, "has_password": user.PasswordHash != ""})
}

func (h *Handler) PreviewUsername(c *gin.Context) {
	var req PreviewUsernameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	username := h.ensureUniqueUsername(usernameBase(req.FirstName, req.LastName))
	c.JSON(http.StatusOK, gin.H{"username": username})
}

func (h *Handler) SetPassword(c *gin.Context) {
	var req SetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "passwords do not match"})
		return
	}
	user, err := h.getUserByUsername(strings.TrimPrefix(req.Username, "@"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.PasswordHash != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password already set — sign in instead"})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	if _, err := h.db.Exec("UPDATE pt_users SET password_hash = $1, updated_at = NOW() WHERE id = $2", string(hash), user.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save password"})
		return
	}
	user.PasswordHash = string(hash)
	token, err := generateToken(*user, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user.ToResponse()})
}

func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var username string
	if req.Username != "" {
		username = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(req.Username, "@")))
		var usernameExists bool
		h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_users WHERE username = $1)", username).Scan(&usernameExists)
		if usernameExists {
			c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
			return
		}
	} else {
		username = h.ensureUniqueUsername(usernameBase(req.FirstName, req.LastName))
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	user, err := h.insertUser(username, req.FirstName, req.LastName, string(hash))
	if err != nil {
		log.Printf("register insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}

	token, err := generateToken(*user, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"token": token, "user": user.ToResponse()})
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	username := strings.TrimPrefix(req.Username, "@")
	user, err := h.getUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	token, err := generateToken(*user, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user.ToResponse()})
}

func (h *Handler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	user, err := h.getUserByID(userID.(string))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, user.ToResponse())
}

type AdminCreateUserRequest struct {
	Name      string `json:"name"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Email     string `json:"email"`
	Password  string `json:"password" binding:"required,min=6"`
}

func (h *Handler) CreateAdminUser(c *gin.Context) {
	var req AdminCreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.FirstName == "" && req.LastName == "" && req.Name != "" {
		req.FirstName, req.LastName = splitName(req.Name)
	}
	if req.FirstName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "first_name is required"})
		return
	}

	if req.Email != "" {
		if _, err := h.getUserByEmail(req.Email); err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "email already registered"})
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	username := h.ensureUniqueUsername(usernameBase(req.FirstName, req.LastName))

	var emailArg interface{}
	if req.Email != "" {
		emailArg = req.Email
	}

	user, err := h.insertUserWithEmail(username, req.FirstName, req.LastName, string(hash), emailArg)
	if err != nil {
		log.Printf("create user insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}
	c.JSON(http.StatusCreated, user.ToResponse())
}

func (h *Handler) ListUsers(c *gin.Context) {
	rows, err := h.db.Query("SELECT " + userSelectCols + " FROM pt_users ORDER BY created_at DESC")
	if err != nil {
		log.Printf("list users error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	users := []models.UserResponse{}
	for rows.Next() {
		u, err := scanUserRows(rows)
		if err != nil {
			continue
		}
		users = append(users, u.ToResponse())
	}
	c.JSON(http.StatusOK, users)
}

func (h *Handler) DeleteMe(c *gin.Context) {
	callerID, _ := c.Get("user_id")
	userID := callerID.(string)

	if _, err := h.db.Exec("DELETE FROM pt_users WHERE id = $1", userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete account"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "account deleted"})
}

func (h *Handler) DeleteUser(c *gin.Context) {
	userID := c.Param("id")
	callerID, _ := c.Get("user_id")
	if callerID.(string) == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you cannot delete your own account"})
		return
	}

	res, err := h.db.Exec("DELETE FROM pt_users WHERE id = $1", userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}

func generateToken(user models.User, secret string) (string, error) {
	claims := middleware.Claims{
		UserID: user.ID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(72 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
