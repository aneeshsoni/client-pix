# =============================================================================
# Python Backend Dockerfile
# =============================================================================
# Multi-stage build for smaller production images
# =============================================================================

# --- Build Stage ---
FROM python:3.13-slim AS builder

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Create virtual environment and install dependencies
# Use --python to ensure venv is created with the right Python
RUN uv venv /app/.venv && \
    . /app/.venv/bin/activate && \
    uv sync --frozen --no-cache

# --- Production Stage ---
FROM python:3.13-slim

WORKDIR /app

# Install runtime dependencies (curl for health checks, ffmpeg for video processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /app/.venv /app/.venv

# Copy application code
COPY . .

# Create uploads directory and make entrypoint executable
RUN mkdir -p /app/uploads && \
    chmod +x /app/docker-entrypoint.sh

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH"
ENV VIRTUAL_ENV="/app/.venv"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:8000/api/system/health || exit 1

# Run migrations on startup, then start uvicorn
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
