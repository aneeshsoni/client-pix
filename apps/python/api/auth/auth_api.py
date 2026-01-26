"""Authentication API endpoints."""

from core.database import get_db
from core.rate_limit import AUTH_RATE_LIMIT, REGISTER_RATE_LIMIT, limiter
from fastapi import APIRouter, Depends, HTTPException, Request
from models.api.auth_api_models import (
    AdminResponse,
    ChangePasswordRequest,
    Disable2FARequest,
    Enable2FARequest,
    LoginRequest,
    LoginResponseWith2FA,
    RefreshTokenRequest,
    RegisterRequest,
    Setup2FAResponse,
    SetupStatusResponse,
    TokenResponse,
    UpdateProfileRequest,
    Verify2FARequest,
)
from models.db.admin_db_models import Admin
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.jwt_util import (
    create_access_token,
    create_refresh_token,
    create_temp_2fa_token,
    get_admin_id_from_token,
    verify_refresh_token,
    verify_temp_2fa_token,
)
from utils.security_util import (
    decode_backup_codes,
    encode_backup_codes,
    generate_backup_codes,
    generate_qr_code_data_url,
    generate_totp_secret,
    get_totp_uri,
    hash_password,
    verify_backup_code,
    verify_password,
    verify_totp_code,
)

router = APIRouter(prefix="/auth", tags=["auth"])


async def get_current_admin(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Admin:
    """Dependency to get the current authenticated admin."""
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header[7:]  # Remove "Bearer " prefix
    admin_id = get_admin_id_from_token(token)

    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    stmt = select(Admin).where(Admin.id == admin_id)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")

    return admin


@router.get("/setup-status", response_model=SetupStatusResponse)
async def get_setup_status(db: AsyncSession = Depends(get_db)):
    """Check if initial setup is needed (no admins exist)."""
    stmt = select(func.count(Admin.id))
    result = await db.execute(stmt)
    count = result.scalar()

    if count == 0:
        return SetupStatusResponse(
            needs_setup=True,
            message="Welcome! Create your admin account to get started.",
        )

    return SetupStatusResponse(
        needs_setup=False,
        message="Setup complete. Please log in.",
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
@limiter.limit(REGISTER_RATE_LIMIT)
async def register(
    request: Request,
    data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new admin account.

    The first registered account becomes the owner.
    Additional accounts can only be created by the owner (future feature).
    """
    # Check if any admins exist
    stmt = select(func.count(Admin.id))
    result = await db.execute(stmt)
    admin_count = result.scalar()

    # For now, only allow registration if no admins exist
    if admin_count > 0:
        raise HTTPException(
            status_code=403,
            detail="Registration is closed. Please contact the administrator.",
        )

    # Check if email already exists
    stmt = select(Admin).where(Admin.email == data.email)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create admin
    password_hash = hash_password(data.password)
    admin = Admin(
        email=data.email,
        password_hash=password_hash,
        name=data.name,
        is_owner=admin_count == 0,  # First user is owner
    )

    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    # Generate tokens
    access_token, expires_in = create_access_token(admin.id, admin.email)
    refresh_token, _ = create_refresh_token(admin.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@router.post("/login", response_model=TokenResponse | LoginResponseWith2FA)
@limiter.limit(AUTH_RATE_LIMIT)
async def login(
    request: Request,
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Login with email and password.

    If 2FA is enabled, returns a temporary token that must be verified
    via the /verify-2fa endpoint before a full access token is issued.
    """
    stmt = select(Admin).where(Admin.email == data.email)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Check if 2FA is enabled
    if admin.totp_enabled and admin.totp_secret:
        # Return temporary token for 2FA verification
        temp_token = create_temp_2fa_token(admin.id)
        return LoginResponseWith2FA(
            requires_2fa=True,
            temp_token=temp_token,
        )

    # No 2FA, generate full access and refresh tokens
    access_token, expires_in = create_access_token(admin.id, admin.email)
    refresh_token, _ = create_refresh_token(admin.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@router.get("/me", response_model=AdminResponse)
async def get_current_user(admin: Admin = Depends(get_current_admin)):
    """Get the current authenticated admin."""
    return AdminResponse(
        id=admin.id,
        email=admin.email,
        name=admin.name,
        is_owner=admin.is_owner,
        totp_enabled=admin.totp_enabled,
        created_at=admin.created_at,
    )


@router.patch("/me", response_model=AdminResponse)
async def update_profile(
    data: UpdateProfileRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update the current admin's profile (email and/or name)."""
    if data.email is not None and data.email != admin.email:
        # Check if email already exists
        stmt = select(Admin).where(Admin.email == data.email)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        admin.email = data.email

    if data.name is not None:
        admin.name = data.name

    await db.commit()
    await db.refresh(admin)

    return AdminResponse(
        id=admin.id,
        email=admin.email,
        name=admin.name,
        is_owner=admin.is_owner,
        totp_enabled=admin.totp_enabled,
        created_at=admin.created_at,
    )


@router.post("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change the current admin's password."""
    if not verify_password(data.current_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    admin.password_hash = hash_password(data.new_password)
    await db.commit()

    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout():
    """
    Logout the current admin.

    Note: With JWT, logout is client-side (delete the token).
    This endpoint exists for API completeness.
    """
    return {"message": "Logged out successfully"}


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(AUTH_RATE_LIMIT)
async def refresh(
    request: Request,
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Refresh an access token using a valid refresh token.

    Returns a new access token and refresh token pair.
    """
    admin_id = verify_refresh_token(data.refresh_token)
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Get admin to verify they still exist
    stmt = select(Admin).where(Admin.id == admin_id)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")

    # Generate new tokens
    access_token, expires_in = create_access_token(admin.id, admin.email)
    refresh_token, _ = create_refresh_token(admin.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


# ============================================================================
# 2FA Endpoints
# ============================================================================


@router.post("/verify-2fa", response_model=TokenResponse)
@limiter.limit(AUTH_RATE_LIMIT)
async def verify_2fa(
    request: Request,
    data: Verify2FARequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify 2FA code and issue full access token.

    Called after login when 2FA is enabled.
    Accepts either TOTP code or backup code.
    """
    # Verify temporary token
    admin_id = verify_temp_2fa_token(data.temp_token)
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid or expired 2FA session")

    # Get admin
    stmt = select(Admin).where(Admin.id == admin_id)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin or not admin.totp_enabled or not admin.totp_secret:
        raise HTTPException(status_code=401, detail="2FA not configured")

    # Normalize the code (remove spaces/dashes for TOTP)
    code = data.code.strip().replace(" ", "").replace("-", "")

    # Try TOTP verification first (6 digits)
    if len(code) == 6 and code.isdigit():
        if verify_totp_code(admin.totp_secret, code):
            # Success - issue full tokens
            access_token, expires_in = create_access_token(admin.id, admin.email)
            refresh_token, _ = create_refresh_token(admin.id)
            return TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=expires_in,
            )
        raise HTTPException(status_code=401, detail="Invalid verification code")

    # Try backup code (8 hex characters)
    is_valid, new_backup_codes = verify_backup_code(admin.backup_codes, code)
    if is_valid:
        # Update backup codes (remove used one)
        admin.backup_codes = new_backup_codes
        await db.commit()

        # Success - issue full tokens
        access_token, expires_in = create_access_token(admin.id, admin.email)
        refresh_token, _ = create_refresh_token(admin.id)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
        )

    raise HTTPException(status_code=401, detail="Invalid verification code")


@router.get("/2fa/setup", response_model=Setup2FAResponse)
async def setup_2fa(
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate 2FA setup data (QR code and backup codes).

    This endpoint generates a new TOTP secret but does NOT enable 2FA.
    The user must verify the code via /2fa/enable to activate it.
    """
    # Generate new secret and backup codes
    secret = generate_totp_secret()
    backup_codes = generate_backup_codes()

    # Store the secret temporarily (not enabled yet)
    admin.totp_secret = secret
    admin.backup_codes = encode_backup_codes(backup_codes)
    await db.commit()

    # Generate QR code
    uri = get_totp_uri(secret, admin.email)
    qr_code = generate_qr_code_data_url(uri)

    return Setup2FAResponse(
        qr_code=qr_code,
        secret=secret,
        backup_codes=backup_codes,
    )


@router.post("/2fa/enable")
async def enable_2fa(
    data: Enable2FARequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Enable 2FA after verifying the setup.

    Requires the current TOTP code to prove the authenticator is configured correctly,
    and the user's password for security confirmation.
    """
    # Verify password
    if not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    # Check if secret exists (from setup)
    if not admin.totp_secret:
        raise HTTPException(
            status_code=400,
            detail="2FA not set up. Call /2fa/setup first.",
        )

    # Verify the TOTP code
    if not verify_totp_code(admin.totp_secret, data.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Enable 2FA
    admin.totp_enabled = True
    await db.commit()

    return {"message": "Two-factor authentication enabled successfully"}


@router.post("/2fa/disable")
async def disable_2fa(
    data: Disable2FARequest,
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Disable 2FA.

    Requires the current TOTP code (or backup code) and password.
    """
    # Verify password
    if not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    if not admin.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    # Verify the code (TOTP or backup)
    code = data.code.strip().replace(" ", "").replace("-", "")
    code_valid = False

    # Try TOTP first
    if admin.totp_secret and len(code) == 6 and code.isdigit():
        code_valid = verify_totp_code(admin.totp_secret, code)

    # Try backup code if TOTP failed
    if not code_valid:
        is_valid, _ = verify_backup_code(admin.backup_codes, code)
        code_valid = is_valid

    if not code_valid:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Disable 2FA and clear secrets
    admin.totp_enabled = False
    admin.totp_secret = None
    admin.backup_codes = None
    await db.commit()

    return {"message": "Two-factor authentication disabled successfully"}


@router.get("/2fa/backup-codes")
async def get_remaining_backup_codes(
    admin: Admin = Depends(get_current_admin),
):
    """
    Get the count of remaining backup codes.

    Returns just the count, not the actual codes (for security).
    """
    if not admin.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    codes = decode_backup_codes(admin.backup_codes)
    return {"remaining_count": len(codes)}


@router.post("/2fa/regenerate-backup-codes", response_model=Setup2FAResponse)
async def regenerate_backup_codes(
    data: Enable2FARequest,  # Reusing this model - requires code and password
    admin: Admin = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Regenerate backup codes.

    Requires the current TOTP code and password.
    Returns new backup codes (old ones are invalidated).
    """
    # Verify password
    if not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")

    if not admin.totp_enabled or not admin.totp_secret:
        raise HTTPException(status_code=400, detail="2FA is not enabled")

    # Verify the TOTP code
    if not verify_totp_code(admin.totp_secret, data.code):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Generate new backup codes
    backup_codes = generate_backup_codes()
    admin.backup_codes = encode_backup_codes(backup_codes)
    await db.commit()

    # Return the setup response format (but with empty QR/secret since not regenerating those)
    uri = get_totp_uri(admin.totp_secret, admin.email)
    qr_code = generate_qr_code_data_url(uri)

    return Setup2FAResponse(
        qr_code=qr_code,
        secret=admin.totp_secret,
        backup_codes=backup_codes,
    )
