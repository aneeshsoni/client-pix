"""Auth API request/response models."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    """Request to register a new admin."""
    email: EmailStr
    password: str
    name: str | None = None


class LoginRequest(BaseModel):
    """Request to login."""
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    """Request to change password."""
    current_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    """Request to update admin profile."""
    email: EmailStr | None = None
    name: str | None = None


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class AdminResponse(BaseModel):
    """Admin user response."""
    id: uuid.UUID
    email: str
    name: str | None
    is_owner: bool
    created_at: datetime


class SetupStatusResponse(BaseModel):
    """Check if initial setup is needed."""
    needs_setup: bool
    message: str
