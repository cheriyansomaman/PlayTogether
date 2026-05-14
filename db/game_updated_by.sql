-- Migration: add updated_by to pt_event_games
ALTER TABLE pt_event_games
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES pt_users (id) ON DELETE SET NULL;
