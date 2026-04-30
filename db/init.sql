-- PlayTogether PostgreSQL schema v1
-- Generated from docs/sql_v1.md

CREATE
EXTENSION IF NOT EXISTS "pgcrypto";  -- provides gen_random_uuid()

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE pt_users
(
    id            UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    username      VARCHAR(64)  NOT NULL UNIQUE,
    first_name    VARCHAR(128) NOT NULL,
    last_name     VARCHAR(128) NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    age           INTEGER,
    address       TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pt_users_username ON pt_users (username);

-- ── Events ────────────────────────────────────────────────────────────────────
CREATE TABLE pt_events
(
    id                     UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    name                   VARCHAR(256) NOT NULL,
    description            TEXT,
    location               VARCHAR(256),
    start_date             DATE,
    end_date               DATE,
    settings_point_system  JSONB,
    settings_join_request  JSONB,
    settings_user_template JSONB,
    event_logo_base64      text NULL,
    event_logo_url         varchar NULL,
    created_by             UUID         NOT NULL REFERENCES pt_users (id) ON DELETE RESTRICT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pt_events_created_by ON pt_events (created_by);

-- ── Event Members ─────────────────────────────────────────────────────────────
CREATE TABLE pt_event_members
(
    id         UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id   UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES pt_users (id) ON DELETE CASCADE,
    role       VARCHAR(32) NOT NULL DEFAULT 'coordinator',
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX idx_pt_event_members_event ON pt_event_members (event_id);
CREATE INDEX idx_pt_event_members_user ON pt_event_members (user_id);

-- ── Games ─────────────────────────────────────────────────────────────────────
CREATE TABLE pt_games
(
    id                 UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    event_id           UUID         NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    name               VARCHAR(256) NOT NULL,
    description        TEXT,
    individual_or_team VARCHAR(16)  NOT NULL DEFAULT 'individual'
        CHECK (individual_or_team IN ('individual', 'team')),
    age_restriction    BOOLEAN      NOT NULL DEFAULT FALSE,
    age_start          INTEGER,
    age_end            INTEGER,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, name)
);

CREATE INDEX idx_pt_games_event ON pt_games (event_id);
CREATE INDEX idx_pt_games_name ON pt_games (name);

-- ── Teams ─────────────────────────────────────────────────────────────────────
CREATE TABLE pt_teams
(
    id          UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    event_id    UUID         NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    name        VARCHAR(256) NOT NULL,
    description TEXT,
    logo_url    VARCHAR(512),
    logo_base64 TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, name)
);

CREATE INDEX idx_pt_teams_event ON pt_teams (event_id);

-- ── Participants ──────────────────────────────────────────────────────────────
CREATE TABLE pt_participants
(
    id         UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id   UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    game_id    UUID        NOT NULL REFERENCES pt_games (id) ON DELETE CASCADE,
    team_id    UUID        REFERENCES pt_teams (id) ON DELETE SET NULL,
    user_id    UUID REFERENCES pt_users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One user per game (individual)
CREATE UNIQUE INDEX idx_pt_participants_individual
    ON pt_participants (event_id, game_id, user_id) WHERE user_id IS NOT NULL;

-- One team per game slot (team)
CREATE UNIQUE INDEX idx_pt_participants_team
    ON pt_participants (event_id, game_id, team_id) WHERE team_id IS NOT NULL AND user_id IS NULL;

-- ── Join Requests ─────────────────────────────────────────────────────────────
CREATE TABLE pt_join_requests
(
    id         UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id   UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES pt_users (id) ON DELETE CASCADE,
    status     VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX idx_pt_join_requests_event ON pt_join_requests (event_id);

-- ── Results ───────────────────────────────────────────────────────────────────
CREATE TABLE pt_results
(
    id          UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    game_id     UUID        NOT NULL REFERENCES pt_games (id) ON DELETE CASCADE,
    result_data JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, game_id)
);

CREATE INDEX idx_pt_results_event ON pt_results (event_id);
CREATE INDEX idx_pt_results_game ON pt_results (game_id);
