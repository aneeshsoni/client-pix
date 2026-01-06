#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "Starting Docker..."
    open -a Docker
    while ! docker info > /dev/null 2>&1; do
        sleep 2
    done
fi

# Start PostgreSQL and Nginx
docker compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL
until docker exec clientpix-db pg_isready -U clientpix > /dev/null 2>&1; do
    sleep 1
done

# Install dependencies if needed
[ ! -d "apps/python/.venv" ] && (cd apps/python && uv sync)
[ ! -d "apps/nextjs/node_modules" ] && (cd apps/nextjs && npm install)

# Start backend
(cd apps/python && uv run fastapi dev) &
BACKEND_PID=$!

# Start frontend
(cd apps/nextjs && npm run dev) &
FRONTEND_PID=$!

# Wait for services
sleep 3

echo "✓ Services running"
echo "  App: http://localhost"
echo "  API: http://localhost/docs"
echo ""
echo "Press Ctrl+C to stop"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker compose -f docker-compose.dev.yml down; exit" SIGINT SIGTERM

wait
