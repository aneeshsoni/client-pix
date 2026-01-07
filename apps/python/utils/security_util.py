"""Security utilities for authentication and token generation."""

import secrets

import bcrypt


def generate_token(length: int = 32) -> str:
    """Generate a secure random token for share links."""
    return secrets.token_urlsafe(length)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a hash."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
