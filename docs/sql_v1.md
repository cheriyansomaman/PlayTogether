I'm migrating from couchbase to postgres.
- I don't want to migrate any data.
- I will modify the data structure.

postgres data structure:
tables
1. PT_USERS
2. PT_EVENTS
3. PT_EVENT_MEMBERS
4. PT_GAMES
5. PT_TEAMS
6. PT_PARTICIPANTS
7. PT_JOIN_REQUESTS
8. PT_RESULTS

Table structure:
1. PT_USERS
- id (primary key, uuid)
- username (unique, varchar)
- first_name (varchar)
- last_name (varchar)
- password_hash (varchar)
- created_at (timestamp)
- updated_at (timestamp)
- age (integer, optional)
- address (varchar, optional)

2. PT_EVENTS
- id (primary key, uuid)
- name (varchar)
- description (text, optional)
- start_date (date, optional)
- end_date (date, optional)
- location (varchar, optional)
- settings_point_system (jsonb, optional)
- settings_join_request (jsonb, optional)
- settings_user_template (jsonb, optional)
- created_at (timestamp)
- updated_at (timestamp)
- created_by (uuid, foreign key to PT_USERS.id)

3. PT_EVENT_MEMBERS
- id (primary key, uuid)
- event_id (uuid, foreign key to PT_EVENTS.id)
- user_id (uuid, foreign key to PT_USERS.id)
- role (varchar, e.g., "admin", "member")
- joined_at (timestamp)
- updated_at (timestamp)
- unique(event_id, user_id)
- foreign key (event_id) references PT_EVENTS(id) on delete cascade
- foreign key (user_id) references PT_USERS(id) on delete cascade
- index on event_id
- index on user_id

4. PT_GAMES
- id (primary key, uuid)
- event_id (uuid, foreign key to PT_EVENTS.id)
- name (varchar)
- description (text, optional)
- age_restriction (boolean, optional)
- age_start (integer, mandatory on age_restriction=true)
- age_end (integer, optional)
- idividual_or_team (varchar, "individual" or "team")
- created_at (timestamp)
- updated_at (timestamp)
- foreign key (event_id) references PT_EVENTS(id) on delete cascade
- index on event_id
- unique(event_id, name)
- index on name

5. PT_TEAMS
- id (primary key, uuid)
- event_id (uuid, foreign key to PT_EVENTS.id)
- name (varchar)
- logo_base64 (text, optional)
- logo_url (varchar, optional)
- description (text, optional)
- created_at (timestamp)
- updated_at (timestamp)
- foreign key (event_id) references PT_EVENTS(id) on delete cascade
- index on event_id
- unique(event_id, name)

6. PT_PARTICIPANTS
- id (primary key, uuid)
- event_id (uuid, foreign key to PT_EVENTS.id)
- game_id (uuid, foreign key to PT_GAMES.id)
- team_id (uuid, foreign key to PT_TEAMS.id)
- user_id (uuid, foreign key to PT_USERS.id, optional for team games)
- created_at (timestamp)
- updated_at (timestamp)
- foreign key (event_id) references PT_EVENTS(id) on delete cascade
- foreign key (game_id) references PT_GAMES(id) on delete cascade
- foreign key (team_id) references PT_TEAMS(id) on delete set null
- foreign key (user_id) references PT_USERS(id) on delete cascade
- unique(event_id, game_id, team_id, user_id) for individual games
- unique(event_id, game_id, team_id) for team games

7. PT_JOIN_REQUESTS
- id (primary key, uuid)
- event_id (uuid, foreign key to PT_EVENTS.id)
- user_id (uuid, foreign key to PT_USERS.id)
- status (varchar, "pending", "approved", "rejected")
- created_at (timestamp)
- updated_at (timestamp)

8. PT_RESULTS
- id (primary key, uuid)
- event_id (uuid, foreign key to PT_EVENTS.id)
- game_id (uuid, foreign key to PT_GAMES.id)
- result_data (jsonb) dynamic as per settings_point_system in PT_EVENTS
- created_at (timestamp)
- updated_at (timestamp)
- foreign key (event_id) references PT_EVENTS(id) on delete cascade
- foreign key (game_id) references PT_GAMES(id) on delete cascade
- index on event_id
- index on game_id
- unique(event_id, game_id)