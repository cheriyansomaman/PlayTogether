package handlers

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/playtogether/backend/models"
)

func (h *Handler) ListGameParticipants(c *gin.Context) {
	gameID := c.Param("id")

	const cols = `id, event_id, game_id, team_id, name, email, age, sport, bib_number, nationality, created_by, created_at`
	rows, err := h.db.Query(
		"SELECT "+cols+" FROM pt_event_game_participants WHERE game_id=$1 ORDER BY name ASC",
		gameID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}
	defer rows.Close()

	participants := []models.Participant{}
	for rows.Next() {
		p, err := scanParticipantRows(rows)
		if err != nil {
			continue
		}
		participants = append(participants, *p)
	}
	c.JSON(http.StatusOK, participants)
}

func (h *Handler) CreateGameParticipant(c *gin.Context) {
	gameID := c.Param("id")
	callerID, _ := c.Get("user_id")

	game, err := h.getGameByID(gameID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	if !h.hasEventRole(callerID.(string), game.EventID, models.EventRoleMember) {
		c.JSON(http.StatusForbidden, gin.H{"error": "event member access required"})
		return
	}

	var req CreateParticipantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TeamID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team is required"})
		return
	}

	var teamExists bool
	h.db.QueryRow("SELECT EXISTS(SELECT 1 FROM pt_event_teams WHERE id = $1)", req.TeamID).Scan(&teamExists)
	if !teamExists {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team not found"})
		return
	}

	if game.AgeRestricted {
		if req.Age <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("age is required for this game (allowed range: %d–%d)", game.AgeFrom, game.AgeTo)})
			return
		}
		if req.Age < game.AgeFrom || req.Age > game.AgeTo {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("participant age %d is outside the allowed range %d–%d", req.Age, game.AgeFrom, game.AgeTo)})
			return
		}
	}

	var id string
	err = h.db.QueryRow(
		`INSERT INTO pt_event_game_participants (event_id, game_id, team_id, name, email, age, sport, bib_number, nationality, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
		game.EventID, gameID, req.TeamID, req.Name, nullableStr(req.Email),
		nullableInt(req.Age), nullableStr(req.Sport), nullableStr(req.BibNumber), nullableStr(req.Nationality),
		callerID.(string),
	).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add participant"})
		return
	}

	// Sync team back to the event member record — by user_id (preferred) or email.
	if req.TeamID != "" {
		if req.UserID != "" {
			h.db.Exec(
				`UPDATE pt_event_members SET team_id = $1, updated_at = NOW()
				 WHERE event_id = $2 AND user_id = $3`,
				req.TeamID, game.EventID, req.UserID,
			)
		} else if req.Email != "" {
			h.db.Exec(
				`UPDATE pt_event_members em
				 SET team_id = $1, updated_at = NOW()
				 FROM pt_users u
				 WHERE em.event_id = $2
				   AND em.user_id = u.id
				   AND u.email = $3`,
				req.TeamID, game.EventID, req.Email,
			)
		}
	}

	participant, _ := h.getParticipantByID(id)
	h.hub.Broadcast(models.WSMessage{Type: "participant_added", EventID: game.EventID, Data: participant})
	c.JSON(http.StatusCreated, participant)
}
