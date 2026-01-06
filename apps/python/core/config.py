"""Application configuration using environment variables."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Application
APP_NAME = os.getenv("APP_NAME", "Client Pix API")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://clientpix:clientpix_dev@localhost:5432/clientpix",
)

# Storage
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))

# Image processing settings
# Thumbnails for grid view (higher res for retina displays)
THUMBNAIL_SIZE = (800, 800)  # Max dimensions, preserves aspect ratio
THUMBNAIL_QUALITY = 90  # WebP quality (0-100)

# Web-optimized version for lightbox viewing
WEB_MAX_DIMENSION = int(os.getenv("WEB_MAX_DIMENSION", "2400"))
WEB_QUALITY = 92  # Higher quality for full-screen viewing
