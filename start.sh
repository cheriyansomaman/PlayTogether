#!/bin/bash

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PID_FILE="$ROOT_DIR/.backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.frontend.pid"

kill_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "Killing process(es) on port $port: $pids"
    echo "$pids" | xargs kill 2>/dev/null || true
    # Wait for port to free
    local deadline=$((SECONDS + 10))
    while lsof -ti :"$port" &>/dev/null; do
      if [ $SECONDS -ge $deadline ]; then
        echo "Force killing port $port..."
        lsof -ti :"$port" | xargs kill -9 2>/dev/null || true
        sleep 0.5
        break
      fi
      sleep 0.5
    done
  fi
}

stop_process() {
  local name=$1
  local pid_file=$2
  local pattern=$3

  # SIGTERM via pid file
  if [ -f "$pid_file" ]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $name (PID $pid)..."
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi

  # SIGTERM via process name (catches stale pid file or direct runs)
  pkill -f "$pattern" 2>/dev/null || true

  # Poll until dead (wait doesn't work for non-child processes)
  local deadline=$((SECONDS + 10))
  while pgrep -f "$pattern" &>/dev/null; do
    if [ $SECONDS -ge $deadline ]; then
      echo "Force killing $name..."
      pkill -9 -f "$pattern" 2>/dev/null || true
      sleep 0.5
      break
    fi
    sleep 0.5
  done

  echo "$name stopped."
}

echo "=== PlayTogether Start ==="

# Stop existing processes
stop_process "backend" "$BACKEND_PID_FILE" "playtogether-backend"
stop_process "frontend" "$FRONTEND_PID_FILE" "vite"
kill_port 8080
kill_port 5173

# Start Docker Compose (postgres)
echo "Starting Docker Compose..."
docker compose -f "$ROOT_DIR/docker-compose.yml" up -d

# Wait for postgres to be healthy
echo "Waiting for postgres..."
until docker exec playtogether-postgres pg_isready -U playtogether -d playtogether &>/dev/null; do
  sleep 1
done
echo "Postgres ready."

# Build and start backend
echo "Building backend..."
cd "$BACKEND_DIR"
go build -o playtogether-backend .
echo "Starting backend..."
./playtogether-backend &
echo $! > "$BACKEND_PID_FILE"
echo "Backend started (PID $(cat $BACKEND_PID_FILE))"

# Build and start frontend
echo "Building frontend..."
cd "$FRONTEND_DIR"
npm install --silent
echo "Starting frontend..."
npm run dev &
echo $! > "$FRONTEND_PID_FILE"
echo "Frontend started (PID $(cat $FRONTEND_PID_FILE))"

echo ""
echo "=== All services running ==="
echo "  Postgres:  localhost:5432"
echo "  Backend:   check backend logs"
echo "  Frontend:  check frontend logs (Vite default: http://localhost:5173)"
echo ""
echo "PIDs saved: $BACKEND_PID_FILE, $FRONTEND_PID_FILE"
echo "Run 'kill \$(cat .backend.pid .frontend.pid)' to stop app processes."
