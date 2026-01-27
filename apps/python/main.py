from contextlib import asynccontextmanager

from core.config import ALLOWED_ORIGINS, APP_NAME, UPLOAD_DIR
from core.database import init_db
from core.rate_limit import limiter
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from router import router
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from utils.cleanup_util import (
    cleanup_old_temp_files,
    start_cleanup_task,
    stop_cleanup_task,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup: Initialize database tables
    await init_db()
    print("✓ Database initialized")

    # Ensure upload directory exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ Upload directory ready: {UPLOAD_DIR}")

    # Clean up any orphaned temp files from previous runs
    cleanup_old_temp_files(UPLOAD_DIR)
    print("✓ Startup temp file cleanup complete")

    # Start periodic cleanup task
    start_cleanup_task(UPLOAD_DIR)
    print("✓ Periodic cleanup task started (runs every 30 min)")

    yield

    # Shutdown: Cancel cleanup task
    await stop_cleanup_task()
    print("✓ Shutting down")


app = FastAPI(
    title=APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

# Register rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware for frontend
# Origins are configured via ALLOWED_ORIGINS environment variable
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

app.include_router(router)

# Serve uploaded files statically (for development)
# In production, use a CDN or nginx for better performance
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
