#!/bin/sh
set -e

echo "Syncing Python dependencies..."
uv sync --frozen

echo "Running database migrations..."
uv run alembic upgrade head

echo "Starting application..."
exec "$@"
