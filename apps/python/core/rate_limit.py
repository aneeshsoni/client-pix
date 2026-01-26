"""Rate limiting configuration for API endpoints."""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Create limiter instance using client IP as the key
limiter = Limiter(key_func=get_remote_address)

# Rate limit constants
AUTH_RATE_LIMIT = "5/minute"  # Login, 2FA verification
REGISTER_RATE_LIMIT = "3/minute"  # Registration attempts
