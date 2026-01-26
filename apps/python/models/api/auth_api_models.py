"""Auth API request/response models."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    """Request to register a new admin."""

    email: EmailStr
    password: str = Field(
        ..., min_length=8, description="Password must be at least 8 characters"
    )
    name: str | None = None


class LoginRequest(BaseModel):
    """Request to login."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseModel):
    """Request to change password."""

    current_password: str = Field(..., min_length=1)
    new_password: str = Field(
        ..., min_length=8, description="Password must be at least 8 characters"
    )


class UpdateProfileRequest(BaseModel):
    """Request to update admin profile."""

    email: EmailStr | None = None
    name: str | None = None


class TokenResponse(BaseModel):
    """JWT token response with access and refresh tokens."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds for access token


class RefreshTokenRequest(BaseModel):
    """Request to refresh an access token."""

    refresh_token: str


class AdminResponse(BaseModel):
    """Admin user response."""

    id: uuid.UUID
    email: str
    name: str | None
    is_owner: bool
    totp_enabled: bool = False
    created_at: datetime


class SetupStatusResponse(BaseModel):
    """Check if initial setup is needed."""

    needs_setup: bool
    message: str


# ============================================================================
# 2FA Models
# ============================================================================


class LoginResponseWith2FA(BaseModel):
    """Response when 2FA verification is required."""

    requires_2fa: bool = True
    temp_token: str  # Temporary token valid only for 2FA verification


class Verify2FARequest(BaseModel):
    """Request to verify 2FA code."""

    temp_token: str
    code: str  # 6-digit TOTP code or backup code


class Setup2FAResponse(BaseModel):
    """Response with 2FA setup information."""

    qr_code: str  # Data URL for QR code image
    secret: str  # Manual entry secret (for users who can't scan QR)
    backup_codes: list[str]  # One-time backup codes


class Enable2FARequest(BaseModel):
    """Request to enable 2FA after setup."""

    code: str  # Current TOTP code to verify setup
    password: str = Field(..., min_length=1)  # Require password confirmation


class Disable2FARequest(BaseModel):
    """Request to disable 2FA."""

    code: str  # Current TOTP code or backup code
    password: str = Field(..., min_length=1)  # Require password confirmation
