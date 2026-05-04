-- PlayTogether PostgreSQL schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────────────────
CREATE TABLE pt_users
(
    id            UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    username      VARCHAR(64)  NOT NULL UNIQUE,
    first_name    VARCHAR(128) NOT NULL,
    last_name     VARCHAR(128) NOT NULL DEFAULT '',
    password_hash VARCHAR(256),
    age           INTEGER,
    address       TEXT,
    email         VARCHAR(256),
    phone         VARCHAR(32),
    tags              TEXT,
    profile_picture   TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pt_users_username ON pt_users (username);
CREATE UNIQUE INDEX idx_pt_users_email ON pt_users (email) WHERE email IS NOT NULL;

-- ── Events ─────────────────────────────────────────────────────────────────────
CREATE TABLE pt_events
(
    id                     UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    name                   VARCHAR(256) NOT NULL,
    description            TEXT,
    location               VARCHAR(256),
    start_date             DATE,
    end_date               DATE,
    event_type             VARCHAR(64),
    status                 VARCHAR(32)  NOT NULL DEFAULT 'upcoming',
    share_token            VARCHAR(128) UNIQUE,
    settings_point_system  JSONB,
    settings_join_request  JSONB,
    settings_user_template JSONB,
    event_logo_base64      TEXT,
    event_logo_url         VARCHAR,
    created_by             UUID         NOT NULL REFERENCES pt_users (id) ON DELETE RESTRICT,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pt_events_created_by ON pt_events (created_by);
CREATE INDEX idx_pt_events_share_token ON pt_events (share_token) WHERE share_token IS NOT NULL;

-- ── Event Members ──────────────────────────────────────────────────────────────
-- role and team_id are event-specific; personal details live in pt_users.
CREATE TABLE pt_event_members
(
    id         UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id   UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES pt_users (id) ON DELETE CASCADE,
    role       VARCHAR(32) NOT NULL DEFAULT 'viewer',
    team_id    UUID,
    added_by   UUID REFERENCES pt_users (id) ON DELETE SET NULL,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX idx_pt_event_members_event ON pt_event_members (event_id);
CREATE INDEX idx_pt_event_members_user ON pt_event_members (user_id);

-- ── Games ──────────────────────────────────────────────────────────────────────
CREATE TABLE pt_event_games
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
    game_type          VARCHAR(64),
    status             VARCHAR(32)  NOT NULL DEFAULT 'scheduled',
    scheduled_at       TIMESTAMPTZ,
    venue              VARCHAR(256),
    team_ids           JSONB,
    participant_ids    JSONB,
    created_by         UUID REFERENCES pt_users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pt_event_games_event ON pt_event_games (event_id);
CREATE INDEX idx_pt_event_games_name ON pt_event_games (name);
CREATE UNIQUE INDEX idx_pt_event_games_event_name_age
  ON pt_event_games (event_id, name, COALESCE(age_start, -1), COALESCE(age_end, -1));

-- ── Teams ──────────────────────────────────────────────────────────────────────
CREATE TABLE pt_event_teams
(
    id          UUID PRIMARY KEY      DEFAULT gen_random_uuid(),
    event_id    UUID         NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    name        VARCHAR(256) NOT NULL,
    description TEXT,
    logo_url    VARCHAR(512),
    logo_base64 TEXT,
    color       VARCHAR(32),
    created_by  UUID REFERENCES pt_users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, name)
);

CREATE INDEX idx_pt_event_teams_event ON pt_event_teams (event_id);

-- FK from event_members to teams (defined here because pt_event_teams comes after pt_event_members)
ALTER TABLE pt_event_members
    ADD CONSTRAINT fk_event_members_team
    FOREIGN KEY (team_id) REFERENCES pt_event_teams (id) ON DELETE SET NULL;

-- ── Participants ───────────────────────────────────────────────────────────────
CREATE TABLE pt_event_game_participants
(
    id          UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    game_id     UUID        REFERENCES pt_event_games (id) ON DELETE CASCADE,
    team_id     UUID        REFERENCES pt_event_teams (id) ON DELETE SET NULL,
    user_id     UUID        REFERENCES pt_users (id) ON DELETE SET NULL,
    name        VARCHAR(256),
    email       VARCHAR(256),
    age         INTEGER,
    sport       VARCHAR(128),
    bib_number  VARCHAR(32),
    nationality VARCHAR(64),
    created_by  UUID REFERENCES pt_users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pt_event_game_participants_event ON pt_event_game_participants (event_id);
CREATE INDEX idx_pt_event_game_participants_game ON pt_event_game_participants (game_id);
CREATE INDEX idx_pt_event_game_participants_team ON pt_event_game_participants (team_id);

-- ── Join Requests ──────────────────────────────────────────────────────────────
-- user identity is resolved via pt_users JOIN; no redundant denormalised columns.
CREATE TABLE pt_event_join_requests
(
    id          UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES pt_users (id) ON DELETE CASCADE,
    status      VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    questions   JSONB,
    answers     JSONB,
    reviewed_by UUID REFERENCES pt_users (id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id)
);

CREATE INDEX idx_pt_event_join_requests_event ON pt_event_join_requests (event_id);

-- ── Event Point System ────────────────────────────────────────────────────────
CREATE TABLE pt_event_point_system
(
    id            UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id      UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    rank_name     VARCHAR(64) NOT NULL,
    rank_position INT         NOT NULL,
    rank_points   INT         NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, rank_position)
);

CREATE INDEX idx_pt_event_point_system_event ON pt_event_point_system (event_id);

-- ── Results ────────────────────────────────────────────────────────────────────
CREATE TABLE pt_event_results
(
    id          UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id    UUID        NOT NULL REFERENCES pt_events (id) ON DELETE CASCADE,
    game_id     UUID        NOT NULL REFERENCES pt_event_games (id) ON DELETE CASCADE,
    result_data JSONB       NOT NULL DEFAULT '[]',
    status      VARCHAR(32) NOT NULL DEFAULT 'partial',
    recorded_by UUID REFERENCES pt_users (id) ON DELETE SET NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, game_id)
);

CREATE INDEX idx_pt_event_results_event ON pt_event_results (event_id);
CREATE INDEX idx_pt_event_results_game ON pt_event_results (game_id);

-- ── Role Access Control ────────────────────────────────────────────────────────
-- NULL event_id = global default; non-null = per-event override.
-- action values: add_result, modify_result, add_member, remove_member,
--   modify_member, add_participant, remove_participant, modify_participant,
--   add_game, modify_game, add_coordinator, add_admin, change_role,
--   add_team, modify_team, member_join_request_approval, settings_visibility
CREATE TABLE pt_event_role_access
(
    id               UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    event_id         UUID                 REFERENCES pt_events (id) ON DELETE CASCADE,
    action           VARCHAR(64) NOT NULL,
    role_admin       BOOLEAN     NOT NULL DEFAULT TRUE,
    role_coordinator BOOLEAN     NOT NULL DEFAULT FALSE,
    role_viewer      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, action)
);

CREATE INDEX idx_pt_event_role_access_event ON pt_event_role_access (event_id);

-- Global defaults (event_id IS NULL)
INSERT INTO pt_event_role_access (event_id, action, role_admin, role_coordinator, role_viewer) VALUES
    (NULL, 'add_result',                    TRUE,  TRUE,  FALSE),
    (NULL, 'modify_result',                 TRUE,  TRUE,  FALSE),
    (NULL, 'add_member',                    TRUE,  FALSE, FALSE),
    (NULL, 'remove_member',                 TRUE,  FALSE, FALSE),
    (NULL, 'modify_member',                 TRUE,  FALSE, FALSE),
    (NULL, 'add_participant',               TRUE,  TRUE,  FALSE),
    (NULL, 'remove_participant',            TRUE,  TRUE,  FALSE),
    (NULL, 'modify_participant',            TRUE,  TRUE,  FALSE),
    (NULL, 'add_game',                      TRUE,  TRUE,  FALSE),
    (NULL, 'modify_game',                   TRUE,  TRUE,  FALSE),
    (NULL, 'add_coordinator',               TRUE,  FALSE, FALSE),
    (NULL, 'add_admin',                     TRUE,  FALSE, FALSE),
    (NULL, 'change_role',                   TRUE,  FALSE, FALSE),
    (NULL, 'add_team',                      TRUE,  FALSE, FALSE),
    (NULL, 'modify_team',                   TRUE,  FALSE, FALSE),
    (NULL, 'member_join_request_approval',  TRUE,  FALSE, FALSE),
    (NULL, 'settings_visibility',           TRUE,  FALSE, FALSE),
    (NULL, 'start_game',                    TRUE,  TRUE,  FALSE),
    (NULL, 'cancel_game',                   TRUE,  TRUE,  FALSE),
    (NULL, 'duplicate_game',                TRUE,  FALSE, FALSE),
    (NULL, 'edit_game',                     TRUE,  FALSE, FALSE),
    (NULL, 'delete_game',                   TRUE,  FALSE, FALSE);
