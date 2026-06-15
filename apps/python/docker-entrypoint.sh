#!/bin/sh
set -e

cd /app

ensure_face_models() {
    if [ "${FACE_DETECTION_ENABLED:-true}" = "false" ]; then
        return 0
    fi

    if [ "${FACE_AUTO_DOWNLOAD_MODELS:-true}" = "false" ]; then
        return 0
    fi

    detection_model="models_ml/faces/face_detection_yunet_2023mar.onnx"
    recognition_model="models_ml/faces/face_recognition_sface_2021dec.onnx"

    if [ -f "$detection_model" ] && [ -f "$recognition_model" ]; then
        return 0
    fi

    if [ ! -f "scripts/download_face_models.py" ]; then
        echo "Warning: face model files are missing and download script is unavailable."
        return 0
    fi

    echo "Downloading face recognition model assets..."
    if [ -x "/app/.venv/bin/python" ]; then
        /app/.venv/bin/python scripts/download_face_models.py || \
            echo "Warning: face model download failed; People recognition will report not ready."
        return 0
    fi

    if command -v uv >/dev/null 2>&1; then
        uv run python scripts/download_face_models.py || \
            echo "Warning: face model download failed; People recognition will report not ready."
    else
        echo "Warning: no Python runner available to download face model files."
    fi
}

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

ensure_face_models

echo "Starting application..."
exec "$@"
