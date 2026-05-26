"""Application configuration using environment variables."""

import os
from pathlib import Path

# Application
APP_NAME = os.getenv("APP_NAME", "Client Pix API")
DEBUG = os.getenv("DEBUG", "true").lower() == "true"
# Note: BASE_URL removed - domain is auto-detected from request headers

# Database
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://clientpix:clientpix_dev@localhost:5432/clientpix",
)

# Storage
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))

# Upload safety limits. Defaults are intentionally configurable so deployments
# can tune them for their storage and expected video sizes.
MAX_UPLOAD_FILE_BYTES = int(os.getenv("MAX_UPLOAD_FILE_BYTES", str(5 * 1024**3)))
MAX_SHARED_UPLOAD_FILE_BYTES = int(
    os.getenv("MAX_SHARED_UPLOAD_FILE_BYTES", str(1 * 1024**3))
)
MAX_UPLOAD_FILES_PER_REQUEST = int(os.getenv("MAX_UPLOAD_FILES_PER_REQUEST", "25"))
MAX_SHARED_UPLOAD_FILES_PER_REQUEST = int(
    os.getenv("MAX_SHARED_UPLOAD_FILES_PER_REQUEST", "10")
)
MAX_BULK_DELETE_PHOTOS = int(os.getenv("MAX_BULK_DELETE_PHOTOS", "100"))
CHUNK_UPLOAD_SIZE_BYTES = int(os.getenv("CHUNK_UPLOAD_SIZE_BYTES", str(1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "100000000"))
FFPROBE_TIMEOUT_SECONDS = int(os.getenv("FFPROBE_TIMEOUT_SECONDS", "10"))
FFMPEG_TIMEOUT_SECONDS = int(os.getenv("FFMPEG_TIMEOUT_SECONDS", "60"))

# Image processing settings
# Thumbnails for grid view (higher res for retina displays)
THUMBNAIL_SIZE = (800, 800)  # Max dimensions, preserves aspect ratio
THUMBNAIL_QUALITY = 90  # WebP quality (0-100)

# Web-optimized version for lightbox viewing
WEB_MAX_DIMENSION = int(os.getenv("WEB_MAX_DIMENSION", "2400"))
WEB_QUALITY = 90  # Higher quality for full-screen viewing

# Video poster frames used in grid previews. These are separate from image
# thumbnails because a single poster frame is much cheaper than storing
# multiple video-derived variants, and it needs enough resolution for large
# gallery tiles.
VIDEO_THUMBNAIL_MAX_DIMENSION = int(os.getenv("VIDEO_THUMBNAIL_MAX_DIMENSION", "1600"))

# Download cache TTL in hours (cached ZIPs are deleted after this)
DOWNLOAD_CACHE_TTL_HOURS = int(os.getenv("DOWNLOAD_CACHE_TTL_HOURS", "24"))

# CORS - comma-separated list of allowed origins
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost"
).split(",")
