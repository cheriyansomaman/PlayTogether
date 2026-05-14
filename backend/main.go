package main

import (
	"log"
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/config"
	"github.com/playtogether/backend/database"
	"github.com/playtogether/backend/handlers"
	"github.com/playtogether/backend/middleware"
	ws "github.com/playtogether/backend/websocket"
)

func main() {
	cfg := config.Load()

	if err := database.Connect(cfg); err != nil {
		log.Fatalf("PostgreSQL connection failed: %v", err)
	}
	defer database.Close()

	hub := ws.NewHub()
	go hub.Run()

	h := handlers.New(database.DB, hub, cfg.JWTSecret)

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:   []string{"Content-Length"},
	}))

	r.GET("/ws", func(c *gin.Context) { ws.ServeWS(hub, c.Writer, c.Request) })
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/api/public/events/:token", h.GetPublicEvent)

	api := r.Group("/api")

	// Public
	api.POST("/auth/register", h.Register)
	api.POST("/auth/login", h.Login)
	api.POST("/auth/check-username", h.CheckUsername)
	api.POST("/auth/preview-username", h.PreviewUsername)
	api.POST("/auth/set-password", h.SetPassword)

	// Protected — any authenticated user
	p := api.Group("")
	p.Use(middleware.AuthMiddleware(cfg.JWTSecret))

	p.GET("/auth/me", h.Me)
	p.DELETE("/auth/me", h.DeleteMe)
	p.GET("/dashboard", h.GetDashboard)

	// Events — read
	p.GET("/events", h.ListEvents)
	p.GET("/events/:id", h.GetEvent)
	p.GET("/events/:id/games", h.ListGames)
	p.GET("/events/:id/teams", h.ListTeams)
	p.GET("/events/:id/participants", h.ListParticipants)
	p.GET("/events/:id/results", h.ListEventResults)

	// Events — write (handlers enforce event-level role)
	p.PUT("/events/:id", h.UpdateEvent)
	p.PATCH("/events/:id/status", h.UpdateEventStatus)
	p.PATCH("/events/:id/settings", h.UpdateEventSettings)
	p.POST("/events/:id/share", h.GenerateShareLink)
	p.DELETE("/events/:id/share", h.RevokeShareLink)
	p.DELETE("/events/:id", h.DeleteEvent)

	// Event members
	p.GET("/events/:id/members", h.GetEventMembers)
	p.GET("/events/:id/my-role", h.GetMyEventRole)
	p.POST("/events/:id/members", h.AddEventMember)
	p.POST("/events/:id/members/bulk", h.BulkAddMembers)
	p.PUT("/events/:id/members/:userId", h.UpdateEventMember)
	p.DELETE("/events/:id/members/:userId", h.RemoveEventMember)

	// Join requests
	p.POST("/events/:id/join-requests", h.RequestToJoin)
	p.GET("/events/:id/join-requests", h.GetJoinRequests)
	p.GET("/events/:id/my-join-request", h.GetMyJoinRequest)
	p.PATCH("/events/:id/join-requests/:userId", h.ReviewJoinRequest)

	// Games
	p.GET("/games/:id", h.GetGame)
	p.GET("/games/:id/result", h.GetGameResult)
	p.GET("/games/:id/participants", h.ListGameParticipants)
	p.POST("/games/:id/participants", h.CreateGameParticipant)
	p.POST("/events/:id/games", h.CreateGame)
	p.PUT("/games/:id", h.UpdateGame)
	p.PATCH("/games/:id/status", h.UpdateGameStatus)
	p.PATCH("/games/:id/cancel", h.CancelGame)
	p.DELETE("/games/:id", h.DeleteGame)

	// Teams
	p.GET("/teams/:id", h.GetTeam)
	p.POST("/events/:id/teams", h.CreateTeam)
	p.PUT("/teams/:id", h.UpdateTeam)
	p.DELETE("/teams/:id", h.DeleteTeam)

	// Participants
	p.GET("/participants/:id", h.GetParticipant)
	p.POST("/events/:id/participants", h.CreateParticipant)
	p.PUT("/participants/:id", h.UpdateParticipant)
	p.DELETE("/participants/:id", h.DeleteParticipant)

	// Role access
	p.GET("/events/:id/role-access", h.GetEventRoleAccess)
	p.PUT("/events/:id/role-access", h.UpdateEventRoleAccess)
	p.DELETE("/events/:id/role-access", h.ResetEventRoleAccess)

	// Results
	p.POST("/games/:id/result", h.RecordResult)
	p.PUT("/games/:id/result", h.RecordResult)
	p.DELETE("/results/:id", h.DeleteResult)

	// Audit log
	p.GET("/audit", h.ListAuditLog)
	p.GET("/events/:id/audit", h.GetEventAuditLog)

	// User management
	p.GET("/auth/users", h.ListUsers)
	p.POST("/auth/users", h.CreateAdminUser)
	p.PUT("/auth/users/:id", h.UpdateUser)
	p.PUT("/auth/users/:id/password", h.AdminResetPassword)
	p.DELETE("/auth/users/:id", h.DeleteUser)

	// Profile picture
	p.PUT("/auth/me/password", h.ChangeMyPassword)
	p.PUT("/auth/me/profile-picture", h.UpdateProfilePicture)
	p.DELETE("/auth/me/profile-picture", h.RemoveProfilePicture)
	p.PUT("/auth/users/:id/profile-picture", h.UpdateUserProfilePicture)
	p.DELETE("/auth/users/:id/profile-picture", h.RemoveUserProfilePicture)

	p.POST("/events", h.CreateEvent)

	log.Printf("Server starting on port %s", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
