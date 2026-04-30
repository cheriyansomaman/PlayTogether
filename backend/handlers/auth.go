package handlers

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/playtogether/backend/middleware"
	"github.com/playtogether/backend/models"
	"golang.org/x/crypto/bcrypt"
)

// ── KV index helpers ──────────────────────────────────────────────────────────

func emailIndexKey(email string) string       { return "user_email::" + email }
func usernameIndexKey(username string) string { return "user_username::" + username }

func (h *Handler) getUserByEmail(email string) (*models.User, error) {
	idxResult, err := h.collection.Get(emailIndexKey(email), nil)
	if err != nil {
		return nil, err
	}
	var idx struct {
		UserID string `json:"user_id"`
	}
	if err := idxResult.Content(&idx); err != nil {
		return nil, err
	}
	userResult, err := h.collection.Get("user::"+idx.UserID, nil)
	if err != nil {
		return nil, err
	}
	var user models.User
	if err := userResult.Content(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (h *Handler) getUserByUsername(username string) (*models.User, error) {
	idxResult, err := h.collection.Get(usernameIndexKey(username), nil)
	if err != nil {
		return nil, err
	}
	var idx struct {
		UserID string `json:"user_id"`
	}
	if err := idxResult.Content(&idx); err != nil {
		return nil, err
	}
	userResult, err := h.collection.Get("user::"+idx.UserID, nil)
	if err != nil {
		return nil, err
	}
	var user models.User
	if err := userResult.Content(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

// ── Username generation ───────────────────────────────────────────────────────

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
	if _, err := h.collection.Get(usernameIndexKey(base), nil); err != nil {
		return base
	}
	for i := 0; i < 300; i++ {
		candidate := fmt.Sprintf("%s%02d", base, rand.Intn(100))
		if _, err := h.collection.Get(usernameIndexKey(candidate), nil); err != nil {
			return candidate
		}
	}
	return base + uuid.New().String()[:4]
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
	FirstName       string      `json:"first_name" binding:"required"`
	LastName        string      `json:"last_name" binding:"required"`
	Email           string      `json:"email"`
	Password        string      `json:"password" binding:"required,min=6"`
	ConfirmPassword string      `json:"confirm_password" binding:"required"`
	Role            models.Role `json:"role"`
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

// CheckUsername returns whether a username exists and whether it has a password set.
func (h *Handler) CheckUsername(c *gin.Context) {
	var req CheckUsernameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	username := strings.ToLower(strings.TrimPrefix(req.Username, "@"))
	user, err := h.getUserByUsername(username)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"exists": false, "has_password": false})
		return
	}
	c.JSON(http.StatusOK, gin.H{"exists": true, "has_password": user.PasswordHash != ""})
}

// PreviewUsername generates and reserves a unique username without creating a user.
func (h *Handler) PreviewUsername(c *gin.Context) {
	var req PreviewUsernameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	username := h.ensureUniqueUsername(usernameBase(req.FirstName, req.LastName))
	c.JSON(http.StatusOK, gin.H{"username": username})
}

// SetPassword sets a password for an account that was created without one (e.g. bulk-added members).
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
	user.PasswordHash = string(hash)
	if _, err := h.collection.Upsert("user::"+user.ID, user, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save password"})
		return
	}
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
	if req.Password != req.ConfirmPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "passwords do not match"})
		return
	}
	if req.Role == "" || req.Role == models.RoleAdmin {
		req.Role = models.RoleUser
	}

	// Email index — only if email is provided
	if req.Email != "" {
		if _, err := h.collection.Get(emailIndexKey(req.Email), nil); err == nil {
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
	fullName := strings.TrimSpace(req.FirstName + " " + req.LastName)

	user := models.User{
		ID:           uuid.New().String(),
		Type:         "user",
		Email:        req.Email,
		Name:         fullName,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Username:     username,
		PasswordHash: string(hash),
		Role:         req.Role,
		CreatedAt:    time.Now().UTC(),
	}

	if _, err = h.collection.Insert("user::"+user.ID, user, nil); err != nil {
		log.Printf("register insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}
	if req.Email != "" {
		if _, err = h.collection.Insert(emailIndexKey(req.Email), map[string]string{"user_id": user.ID}, nil); err != nil {
			log.Printf("register email index error: %v", err)
			h.collection.Remove("user::"+user.ID, nil)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to index user email"})
			return
		}
	}
	h.collection.Upsert(usernameIndexKey(username), map[string]string{"user_id": user.ID}, nil)

	token, err := generateToken(user, h.jwtSecret)
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
	result, err := h.collection.Get("user::"+userID.(string), nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	var user models.User
	if err := result.Content(&user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse user"})
		return
	}
	c.JSON(http.StatusOK, user.ToResponse())
}

// AdminCreateUserRequest accepts both new format (first_name+last_name) and legacy (name).
type AdminCreateUserRequest struct {
	Name      string      `json:"name"`
	FirstName string      `json:"first_name"`
	LastName  string      `json:"last_name"`
	Email     string      `json:"email"`
	Password  string      `json:"password" binding:"required,min=6"`
	Role      models.Role `json:"role"`
}

func (h *Handler) CreateAdminUser(c *gin.Context) {
	var req AdminCreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Support legacy {name} format
	if req.FirstName == "" && req.LastName == "" && req.Name != "" {
		req.FirstName, req.LastName = splitName(req.Name)
	}
	if req.FirstName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "first_name is required"})
		return
	}
	if req.Role == "" {
		req.Role = models.RoleMember
	}

	if req.Email != "" {
		if _, err := h.collection.Get(emailIndexKey(req.Email), nil); err == nil {
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
	fullName := strings.TrimSpace(req.FirstName + " " + req.LastName)

	user := models.User{
		ID:           uuid.New().String(),
		Type:         "user",
		Email:        req.Email,
		Name:         fullName,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Username:     username,
		PasswordHash: string(hash),
		Role:         req.Role,
		CreatedAt:    time.Now().UTC(),
	}

	if _, err = h.collection.Insert("user::"+user.ID, user, nil); err != nil {
		log.Printf("create user insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}
	if req.Email != "" {
		h.collection.Insert(emailIndexKey(req.Email), map[string]string{"user_id": user.ID}, nil)
	}
	h.collection.Upsert(usernameIndexKey(username), map[string]string{"user_id": user.ID}, nil)

	c.JSON(http.StatusCreated, user.ToResponse())
}

func (h *Handler) ListUsers(c *gin.Context) {
	q := "SELECT u.* FROM `" + h.bucket + "` AS u WHERE u.type = 'user' ORDER BY u.created_at DESC"
	rows, err := h.cluster.Query(q, nil)
	if err != nil {
		log.Printf("list users error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query service unavailable: " + err.Error()})
		return
	}
	defer rows.Close()

	var users []models.UserResponse
	for rows.Next() {
		var u models.User
		if err := rows.Row(&u); err != nil {
			continue
		}
		users = append(users, u.ToResponse())
	}
	if users == nil {
		users = []models.UserResponse{}
	}
	c.JSON(http.StatusOK, users)
}

func (h *Handler) DeleteMe(c *gin.Context) {
	callerID, _ := c.Get("user_id")
	userID := callerID.(string)

	result, err := h.collection.Get("user::"+userID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	var user models.User
	result.Content(&user)

	if _, err := h.collection.Remove("user::"+userID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete account"})
		return
	}
	if user.Username != "" {
		h.collection.Remove(usernameIndexKey(user.Username), nil)
	}
	if user.Email != "" {
		h.collection.Remove(emailIndexKey(user.Email), nil)
	}

	c.JSON(http.StatusOK, gin.H{"message": "account deleted"})
}

func (h *Handler) DeleteUser(c *gin.Context) {
	userID := c.Param("id")

	// Prevent self-deletion
	callerID, _ := c.Get("user_id")
	if callerID.(string) == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "you cannot delete your own account"})
		return
	}

	result, err := h.collection.Get("user::"+userID, nil)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	var user models.User
	result.Content(&user)

	if _, err := h.collection.Remove("user::"+userID, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete user"})
		return
	}
	if user.Username != "" {
		h.collection.Remove(usernameIndexKey(user.Username), nil)
	}
	if user.Email != "" {
		h.collection.Remove(emailIndexKey(user.Email), nil)
	}

	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}

func generateToken(user models.User, secret string) (string, error) {
	claims := middleware.Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(72 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
