"""Authentication API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.api.auth_api_models import (
    AdminResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    SetupStatusResponse,
    TokenResponse,
    UpdateProfileRequest,
)
from models.db.admin_db_models import Admin
from utils.jwt_util import create_access_token, get_admin_id_from_token
from utils.security_util import hash_password, verify_password

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
async def register(
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

    # Generate token
    token, expires_in = create_access_token(admin.id, admin.email)

    return TokenResponse(
        access_token=token,
        expires_in=expires_in,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with email and password."""
    stmt = select(Admin).where(Admin.email == data.email)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Generate token
    token, expires_in = create_access_token(admin.id, admin.email)

    return TokenResponse(
        access_token=token,
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
