-- Migration: add aud_changed_by to all audit tables + update trigger to capture it

ALTER TABLE pt_users_aud                 ADD COLUMN IF NOT EXISTS aud_changed_by UUID;
ALTER TABLE pt_events_aud                ADD COLUMN IF NOT EXISTS aud_changed_by UUID;
ALTER TABLE pt_event_members_aud         ADD COLUMN IF NOT EXISTS aud_changed_by UUID;
ALTER TABLE pt_event_games_aud           ADD COLUMN IF NOT EXISTS aud_changed_by UUID;
ALTER TABLE pt_event_teams_aud           ADD COLUMN IF NOT EXISTS aud_changed_by UUID;
ALTER TABLE pt_event_game_participants_aud ADD COLUMN IF NOT EXISTS aud_changed_by UUID;
ALTER TABLE pt_event_join_requests_aud   ADD COLUMN IF NOT EXISTS aud_changed_by UUID;
ALTER TABLE pt_event_results_aud         ADD COLUMN IF NOT EXISTS aud_changed_by UUID;

-- Update trigger to capture who performed the change via session variable
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
DECLARE
    v_op   CHAR(1);
    v_new  JSONB;
    v_old  JSONB;
    v_by   UUID;
BEGIN
    BEGIN
        v_by := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_by := NULL;
    END;

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
        'INSERT INTO %I (aud_operation, aud_changed_by, row_data, old_data) VALUES ($1, $2, $3, $4)',
        TG_TABLE_NAME || '_aud'
    ) USING v_op, v_by, v_new, v_old;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
