package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type AuditEntry struct {
	TableName     string          `json:"table_name"`
	AudID         string          `json:"aud_id"`
	Operation     string          `json:"operation"`
	ChangedAt     time.Time       `json:"changed_at"`
	RowData       json.RawMessage `json:"row_data"`
	OldData       json.RawMessage `json:"old_data,omitempty"`
	ChangedBy     string          `json:"changed_by"`
	ChangedByName string          `json:"changed_by_name"`
}

const eventAuditUnionQuery = `
SELECT combined.table_name, combined.aud_id::text, combined.aud_operation, combined.aud_changed_at,
       combined.row_data, COALESCE(combined.old_data, 'null'::jsonb) AS old_data,
       COALESCE(combined.aud_changed_by::text, '') AS changed_by,
       COALESCE(TRIM(u.first_name || ' ' || u.last_name), '') AS changed_by_name
FROM (
    SELECT 'pt_events'                   AS table_name, aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_events_aud                   WHERE (row_data->>'id')::text = $1
    UNION ALL
    SELECT 'pt_event_members',                          aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_members_aud            WHERE (row_data->>'event_id')::text = $1
    UNION ALL
    SELECT 'pt_event_games',                            aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_games_aud              WHERE (row_data->>'event_id')::text = $1
    UNION ALL
    SELECT 'pt_event_teams',                            aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_teams_aud              WHERE (row_data->>'event_id')::text = $1
    UNION ALL
    SELECT 'pt_event_game_participants',                aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_game_participants_aud  WHERE (row_data->>'event_id')::text = $1
    UNION ALL
    SELECT 'pt_event_join_requests',                    aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_join_requests_aud      WHERE (row_data->>'event_id')::text = $1
    UNION ALL
    SELECT 'pt_event_results',                          aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_results_aud            WHERE (row_data->>'event_id')::text = $1
) combined
LEFT JOIN pt_users u ON u.id = combined.aud_changed_by
ORDER BY combined.aud_changed_at DESC`

func scanAuditRows(rows *sql.Rows) ([]AuditEntry, error) {
	entries := []AuditEntry{}
	for rows.Next() {
		var e AuditEntry
		var oldRaw json.RawMessage
		if err := rows.Scan(&e.TableName, &e.AudID, &e.Operation, &e.ChangedAt, &e.RowData, &oldRaw, &e.ChangedBy, &e.ChangedByName); err != nil {
			continue
		}
		if string(oldRaw) != "null" {
			e.OldData = oldRaw
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func (h *Handler) GetEventAuditLog(c *gin.Context) {
	eventID := c.Param("id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 10
	}

	rows, err := h.db.Query(eventAuditUnionQuery+" LIMIT $2 OFFSET $3", eventID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	entries, _ := scanAuditRows(rows)

	var total int
	h.db.QueryRow("SELECT COUNT(*) FROM ("+eventAuditUnionQuery+") t", eventID).Scan(&total)

	c.JSON(http.StatusOK, gin.H{"entries": entries, "total": total})
}

const auditUnionQuery = `
SELECT combined.table_name, combined.aud_id::text, combined.aud_operation, combined.aud_changed_at,
       combined.row_data, COALESCE(combined.old_data, 'null'::jsonb) AS old_data,
       COALESCE(combined.aud_changed_by::text, '') AS changed_by,
       COALESCE(TRIM(u.first_name || ' ' || u.last_name), '') AS changed_by_name
FROM (
    SELECT 'pt_users'                    AS table_name, aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_users_aud
    UNION ALL
    SELECT 'pt_events',                                 aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_events_aud
    UNION ALL
    SELECT 'pt_event_members',                          aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_members_aud
    UNION ALL
    SELECT 'pt_event_games',                            aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_games_aud
    UNION ALL
    SELECT 'pt_event_teams',                            aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_teams_aud
    UNION ALL
    SELECT 'pt_event_game_participants',                aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_game_participants_aud
    UNION ALL
    SELECT 'pt_event_join_requests',                    aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_join_requests_aud
    UNION ALL
    SELECT 'pt_event_results',                          aud_id, aud_operation, aud_changed_at, row_data, old_data, aud_changed_by FROM pt_event_results_aud
) combined
LEFT JOIN pt_users u ON u.id = combined.aud_changed_by
ORDER BY combined.aud_changed_at DESC`

func (h *Handler) ListAuditLog(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	if limit < 1 || limit > 100 {
		limit = 10
	}

	rows, err := h.db.Query(auditUnionQuery+" LIMIT $1 OFFSET $2", limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	entries, _ := scanAuditRows(rows)

	var total int
	h.db.QueryRow("SELECT COUNT(*) FROM (" + auditUnionQuery + ") t").Scan(&total)

	c.JSON(http.StatusOK, gin.H{"entries": entries, "total": total})
}
