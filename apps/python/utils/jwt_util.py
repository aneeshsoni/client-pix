"""JWT token utilities for admin authentication."""

import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from core.config import UPLOAD_DIR


def _get_or_create_jwt_secret(upload_dir: Path) -> str:
    """
    Get JWT secret from environment, or auto-generate and persist one.

    This allows zero-config deployment while maintaining security:
    - If JWT_SECRET env var is set, use it (recommended for production)
    - Otherwise, generate a random secret and save to uploads/.jwt_secret
    - The secret persists in the uploads volume across container restarts
    """
    env_secret = os.getenv("JWT_SECRET")
    if env_secret and env_secret != "change-me-in-production":
        return env_secret

    secret_file = upload_dir / ".jwt_secret"

    if secret_file.exists():
        return secret_file.read_text().strip()

    # Generate new secret and persist it

    new_secret = secrets.token_hex(32)  # 64 characters, cryptographically secure

    upload_dir.mkdir(parents=True, exist_ok=True)
    secret_file.write_text(new_secret)

    print(f"Generated new JWT secret and saved to {secret_file}")
    return new_secret


JWT_SECRET = _get_or_create_jwt_secret(UPLOAD_DIR)
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


# ============================================================================
# 2FA Temporary Tokens
# ============================================================================

TEMP_2FA_EXPIRATION_MINUTES = 5


def create_temp_2fa_token(admin_id: uuid.UUID) -> str:
    """
    Create a short-lived temporary token for 2FA verification.
    This token is issued after password verification but before 2FA is complete.
    """
    expires_delta = timedelta(minutes=TEMP_2FA_EXPIRATION_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta

    payload = {
        "sub": str(admin_id),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "2fa_pending",
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_temp_2fa_token(token: str) -> uuid.UUID | None:
    """
    Verify a temporary 2FA token and return the admin ID.
    Returns None if the token is invalid, expired, or wrong type.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        # Check token type
        if payload.get("type") != "2fa_pending":
            return None

        if "sub" in payload:
            return uuid.UUID(payload["sub"])
        return None
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
