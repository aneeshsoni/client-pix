#!/bin/sh
set -e

# Ensure dependencies are installed (handles anonymous volume sync issues in dev)
if [ ! -f "/app/.venv/bin/alembic" ]; then
    echo "Syncing dependencies..."
    uv sync --frozen
fi

echo "Running database migrations..."
uv run alembic upgrade head

echo "Starting application..."
exec "$@"
