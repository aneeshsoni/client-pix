"""Rate limiting configuration for API endpoints."""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Create limiter instance using client IP as the key
limiter = Limiter(key_func=get_remote_address)

# Rate limit constants
AUTH_RATE_LIMIT = os.getenv("AUTH_RATE_LIMIT", "5/minute")  # Login, 2FA verification
REGISTER_RATE_LIMIT = os.getenv(
    "REGISTER_RATE_LIMIT",
    "3/minute",
)  # Registration attempts
SHARE_UPLOAD_RATE_LIMIT = os.getenv(
    "SHARE_UPLOAD_RATE_LIMIT",
    "60/minute",
)  # Public share upload init/complete/multipart
SHARE_UPLOAD_CHUNK_RATE_LIMIT = os.getenv(
    "SHARE_UPLOAD_CHUNK_RATE_LIMIT",
    "600/minute",
)  # 1MB public share chunks
