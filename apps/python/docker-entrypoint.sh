#!/bin/sh
set -e

cd /app

ALEMBIC_BIN=""

if [ -x "/app/.venv/bin/alembic" ]; then
    ALEMBIC_BIN="/app/.venv/bin/alembic"
elif command -v alembic >/dev/null 2>&1; then
    ALEMBIC_BIN="$(command -v alembic)"
fi

if [ -z "$ALEMBIC_BIN" ]; then
    if command -v uv >/dev/null 2>&1; then
        echo "Bootstrapping Python dependencies..."
        uv sync --frozen
        if [ -x "/app/.venv/bin/alembic" ]; then
            ALEMBIC_BIN="/app/.venv/bin/alembic"
        elif command -v alembic >/dev/null 2>&1; then
            ALEMBIC_BIN="$(command -v alembic)"
        fi
    else
        echo "Error: alembic is not available and uv is not installed."
        exit 1
    fi
fi

if [ -z "$ALEMBIC_BIN" ]; then
    echo "Error: alembic is still unavailable after dependency bootstrap."
    exit 1
fi

echo "Running database migrations..."
"$ALEMBIC_BIN" upgrade head

echo "Starting application..."
exec "$@"
