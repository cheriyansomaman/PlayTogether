# PlayTogether

A full-stack sports event management platform that lets users create and manage sports events, organize games and teams, track results, and collaborate in real time.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Roles & Permissions](#roles--permissions)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Option 1: Docker Compose (Recommended)](#option-1-docker-compose-recommended)
  - [Option 2: Run Services Locally](#option-2-run-services-locally)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)

---

## Features

- **Event Management** — Create, edit, and manage sports events with status lifecycle (upcoming → active → completed)
- **Game & Team Management** — Organize games within events, create teams, register participants
- **Result Tracking** — Record and view game results in real time
- **Real-Time Updates** — WebSocket-based live updates across all connected clients
- **Role-Based Access Control** — System-level and per-event roles control what each user can see and do
- **Join Requests** — Members can request to join events; event admins can approve or reject
- **Public Share Links** — Share a read-only event view via a public token URL (no login required)
- **Admin Panel** — System admins can manage all users

---

## Tech Stack

| Layer     | Technology                                |
|-----------|-------------------------------------------|
| Frontend  | React 18, Vite, React Router, Tailwind CSS, Axios |
| Backend   | Go 1.21, Gin, Gorilla WebSocket, JWT      |
| Database  | Couchbase Community 7.2 (NoSQL)           |
| Dev/Prod  | Docker, Docker Compose, Nginx             |

---

## Architecture Overview

```
Browser (React SPA)
    │
    ├── HTTP  /api/*  ──────────► Go Backend (Gin, port 8080)
    └── WS    /ws     ──────────► WebSocket Hub
                                        │
                                   Couchbase (port 8091)
```

- The frontend dev server (Vite, port 3000) proxies `/api` and `/ws` to the backend.
- In production the frontend is served by Nginx, which handles the same proxying.
- The backend connects to Couchbase on startup and creates required indexes automatically.

---

## Project Structure

```
PlayTogether/
├── backend/
│   ├── main.go                  # Entry point, router setup
│   ├── go.mod / go.sum
│   ├── Dockerfile
│   ├── config/config.go         # Environment variable loading
│   ├── database/couchbase.go    # DB connection & index creation
│   ├── middleware/auth.go        # JWT validation, role guards
│   ├── models/models.go         # All data structures
│   ├── handlers/                # Route handlers (auth, events, games, teams, …)
│   └── websocket/hub.go         # WebSocket broadcast hub
│
├── frontend/
│   ├── src/
│   │   ├── pages/               # Login, Register, Dashboard, Events, EventDetail, …
│   │   ├── components/          # Navbar, modals, ProtectedRoute
│   │   ├── context/             # AuthContext, WSContext (WebSocket)
│   │   └── services/api.js      # Axios client + all API calls
│   ├── Dockerfile
│   ├── nginx.conf
│   └── vite.config.js
│
├── docker-compose.yml
├── init-couchbase.sh            # Couchbase cluster initialization
└── setup-couchbase.sh           # Helper: tear down + re-init Couchbase
```

---

## Roles & Permissions

### System Roles (global)

| Role     | Capabilities                                          |
|----------|-------------------------------------------------------|
| `admin`  | Manage all users; admin in every event automatically  |
| `member` | Create events, join events, manage memberships        |
| `user`   | Default role on registration; join via invite/approval |

### Event Roles (per event)

| Role      | Capabilities                                                          |
|-----------|-----------------------------------------------------------------------|
| `admin`   | Full event management: edit, delete, manage members, games, results   |
| `member`  | View and contribute: create games/teams, record results               |
| `viewer`  | Read-only access to event data                                        |

The event creator is automatically assigned the `admin` event role. System-level `admin` users inherit `admin` event role everywhere.

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- **Or**, for local development: Go 1.21+, Node.js 18+, and a running Couchbase instance

---

### Option 1: Docker Compose (Recommended)

This starts Couchbase, the Go backend, and the React frontend together.

```bash
# 1. Clone the repository
git clone <repo-url>
cd PlayTogether

# 2. Initialize the Couchbase cluster (first time only)
./setup-couchbase.sh

# 3. Start all services
docker compose up --build
```

| Service   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost:3000      |
| Backend   | http://localhost:8080      |
| Couchbase | http://localhost:8091      |

> **Couchbase UI credentials:** `Administrator` / `password123`

To stop: `docker compose down`
To wipe data: `docker compose down -v`

---

### Option 2: Run Services Locally

#### 1. Start Couchbase

```bash
docker run -d --name couchbase \
  -p 8091-8096:8091-8096 \
  -p 11210:11210 \
  couchbase:community-7.2.0

# Initialize the cluster
./init-couchbase.sh
```

#### 2. Start the Backend

```bash
cd backend

# Set environment variables (or export them in your shell)
export COUCHBASE_URL="couchbase://localhost"
export COUCHBASE_USERNAME="Administrator"
export COUCHBASE_PASSWORD="password123"
export COUCHBASE_BUCKET="playtogether"
export JWT_SECRET="change-me-in-production"
export PORT="8080"

go run main.go
```

The backend starts at http://localhost:8080. A health check is available at `GET /health`.

#### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts at http://localhost:3000. The Vite dev server automatically proxies `/api` and `/ws` to the backend.

#### 4. Build for Production (Frontend)

```bash
cd frontend
npm run build    # Output written to frontend/dist/
npm run preview  # Preview the production build locally
```

---

## Environment Variables

| Variable              | Default                                          | Description                     |
|-----------------------|--------------------------------------------------|---------------------------------|
| `COUCHBASE_URL`       | `couchbase://localhost`                          | Couchbase connection string     |
| `COUCHBASE_USERNAME`  | `Administrator`                                  | Couchbase username              |
| `COUCHBASE_PASSWORD`  | `password`                                       | Couchbase password              |
| `COUCHBASE_BUCKET`    | `playtogether`                                   | Couchbase bucket name           |
| `JWT_SECRET`          | `playtogether-secret-change-in-production`       | Secret for signing JWT tokens   |
| `PORT`                | `8080`                                           | Backend HTTP port               |

> Change `JWT_SECRET` to a strong random value before deploying to production.

---

## API Overview

| Group           | Endpoints                                                        |
|-----------------|------------------------------------------------------------------|
| Health          | `GET /health`                                                    |
| WebSocket       | `GET /ws`                                                        |
| Public          | `GET /api/public/events/:token`                                  |
| Auth            | `POST /auth/register`, `/auth/login`, `/auth/check-username`, `/auth/set-password` |
| Current user    | `GET /auth/me`                                                   |
| Admin           | `GET /auth/users`, `POST /auth/users`                            |
| Dashboard       | `GET /dashboard`                                                 |
| Events          | `GET/POST /events`, `GET/PUT/PATCH/DELETE /events/:id`           |
| Event Members   | `GET/POST/PUT/DELETE /events/:id/members`                        |
| Join Requests   | `GET/POST/PUT /events/:id/join-requests`                         |
| Games           | `GET/POST /games`, `GET/PUT/PATCH/DELETE /games/:id`             |
| Teams           | `GET/POST /teams`, `GET/PUT/DELETE /teams/:id`                   |
| Participants    | `GET/POST /participants`, `GET/PUT/DELETE /participants/:id`     |
| Results         | `GET/POST /results`, `GET /results/:id`                          |

All protected endpoints require a `Bearer <token>` Authorization header.
