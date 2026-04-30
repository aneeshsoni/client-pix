#!/bin/sh
set -e

cd /app

run_alembic() {
    if [ -x "/app/.venv/bin/alembic" ] && /app/.venv/bin/alembic --help >/dev/null 2>&1; then
        /app/.venv/bin/alembic upgrade head
        return 0
    fi

    if command -v alembic >/dev/null 2>&1 && alembic --help >/dev/null 2>&1; then
        alembic upgrade head
        return 0
    fi

    return 1
}

echo "Running database migrations..."
if ! run_alembic; then
    if command -v uv >/dev/null 2>&1; then
        echo "Bootstrapping Python dependencies..."
        uv sync --frozen
        run_alembic
    else
        echo "Error: alembic is not available and uv is not installed."
        exit 1
    fi
fi

echo "Starting application..."
exec "$@"
