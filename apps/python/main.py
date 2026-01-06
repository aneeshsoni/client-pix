from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import APP_NAME, UPLOAD_DIR
from core.database import init_db

from router import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup: Initialize database tables
    await init_db()
    print("✓ Database initialized")

    # Ensure upload directory exists
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ Upload directory ready: {UPLOAD_DIR}")

    yield
    # Shutdown: Cleanup if needed
    print("✓ Shutting down")


app = FastAPI(
    title=APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

# Serve uploaded files statically (for development)
# In production, use a CDN or nginx for better performance
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
