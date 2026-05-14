-- ── Audit tables ─────────────────────────────────────────────────────────────
-- Each _aud table records every INSERT ('I'), UPDATE ('U'), DELETE ('D').
-- row_data = NEW row (I/U) or OLD row (D).
-- old_data = OLD row for U only.

CREATE TABLE pt_users_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

CREATE TABLE pt_events_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

CREATE TABLE pt_event_members_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

CREATE TABLE pt_event_games_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

CREATE TABLE pt_event_teams_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

CREATE TABLE pt_event_game_participants_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

CREATE TABLE pt_event_join_requests_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

CREATE TABLE pt_event_results_aud (
    aud_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aud_operation  CHAR(1) NOT NULL,
    aud_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    row_data       JSONB NOT NULL,
    old_data       JSONB
);

-- ── Generic audit trigger function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
DECLARE
    v_op   CHAR(1);
    v_new  JSONB;
    v_old  JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_op  := 'I';
        v_new := row_to_json(NEW)::JSONB;
        v_old := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        v_op  := 'U';
        v_new := row_to_json(NEW)::JSONB;
        v_old := row_to_json(OLD)::JSONB;
    ELSE
        v_op  := 'D';
        v_new := row_to_json(OLD)::JSONB;
        v_old := NULL;
    END IF;
    EXECUTE format(
        'INSERT INTO %I (aud_operation, row_data, old_data) VALUES ($1, $2, $3)',
        TG_TABLE_NAME || '_aud'
    ) USING v_op, v_new, v_old;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ── Triggers ──────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_pt_users_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_users
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_pt_events_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_events
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_pt_event_members_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_event_members
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_pt_event_games_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_event_games
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_pt_event_teams_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_event_teams
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_pt_event_game_participants_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_event_game_participants
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_pt_event_join_requests_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_event_join_requests
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_pt_event_results_aud
    AFTER INSERT OR UPDATE OR DELETE ON pt_event_results
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
