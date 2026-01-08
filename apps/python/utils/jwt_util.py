"""JWT token utilities for admin authentication."""

import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt

# Secret key for JWT signing - should be set via environment variable
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production-use-a-long-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days


def create_access_token(admin_id: uuid.UUID, email: str) -> tuple[str, int]:
    """
    Create a JWT access token for an admin user.
    
    Returns:
        tuple: (token_string, expires_in_seconds)
    """
    expires_delta = timedelta(hours=JWT_EXPIRATION_HOURS)
    expire = datetime.now(timezone.utc) + expires_delta
    
    payload = {
        "sub": str(admin_id),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    expires_in = int(expires_delta.total_seconds())
    
    return token, expires_in


def verify_access_token(token: str) -> dict | None:
    """
    Verify and decode a JWT access token.
    
    Returns:
        dict: Decoded payload if valid, None if invalid
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Check token type
        if payload.get("type") != "access":
            return None
            
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_admin_id_from_token(token: str) -> uuid.UUID | None:
    """Extract admin ID from a valid token."""
    payload = verify_access_token(token)
    if payload and "sub" in payload:
        try:
            return uuid.UUID(payload["sub"])
        except ValueError:
            return None
    return None
