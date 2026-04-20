#!/bin/sh
set -e

if ! command -v alembic >/dev/null 2>&1; then
    if command -v uv >/dev/null 2>&1; then
        echo "Bootstrapping Python dependencies..."
        uv sync --frozen
    else
        echo "Error: alembic is not available and uv is not installed."
        exit 1
    fi
fi

echo "Running database migrations..."
alembic upgrade head

echo "Starting application..."
exec "$@"
