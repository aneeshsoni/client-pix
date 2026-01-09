"""Secure file serving API - all file access goes through authentication."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.config import UPLOAD_DIR
from core.database import get_db
from models.db.admin_db_models import Admin
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from models.db.share_link_db_models import ShareLink
from utils.security_util import verify_password
from utils.jwt_util import get_admin_id_from_token

router = APIRouter(prefix="/files", tags=["files"])


async def get_admin_from_token_or_query(
    db: AsyncSession,
    authorization: str | None = Header(None),
    token: str | None = Query(None),
) -> Admin:
    """
    Get admin from either Authorization header or query parameter.
    This allows Image components to pass token via URL.
    """
    jwt_token = None

    # Try Authorization header first
    if authorization and authorization.startswith("Bearer "):
        jwt_token = authorization.replace("Bearer ", "")
    # Fall back to query parameter
    elif token:
        jwt_token = token

    if not jwt_token:
        raise HTTPException(status_code=401, detail="Authentication required")

    admin_id = get_admin_id_from_token(jwt_token)
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    stmt = select(Admin).where(Admin.id == admin_id)
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(status_code=401, detail="Admin not found")

    return admin


def get_file_path(
    file_hash: str, variant: str, extension: str, is_video: bool = False
) -> Path:
    """Get the file path for a given hash and variant."""
    prefix = file_hash[:2]
    second = file_hash[2:4]

    # For videos, original/web point to the video file, thumbnail to poster frame
    if is_video:
        if variant == "original" or variant == "web":
            return UPLOAD_DIR / "videos" / f"{file_hash}{extension}"
        elif variant == "thumbnail":
            return UPLOAD_DIR / "thumbnails" / prefix / second / f"{file_hash}.webp"
        else:
            raise HTTPException(status_code=400, detail="Invalid variant")

    # For images, use standard path structure
    if variant == "original":
        return UPLOAD_DIR / "originals" / prefix / second / f"{file_hash}{extension}"
    elif variant == "thumbnail":
        return UPLOAD_DIR / "thumbnails" / prefix / second / f"{file_hash}.webp"
    elif variant == "web":
        return UPLOAD_DIR / "web" / prefix / second / f"{file_hash}.webp"
    else:
        raise HTTPException(status_code=400, detail="Invalid variant")


# --- Authenticated File Access (Admin only) ---


@router.get("/photo/{photo_id}")
async def get_authenticated_photo(
    photo_id: uuid.UUID,
    variant: str = Query("web", pattern="^(original|thumbnail|web)$"),
    token: str | None = Query(
        None, description="JWT auth token (alternative to Authorization header)"
    ),
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a photo file. Requires admin authentication.

    Variants:
    - thumbnail: Small preview (800px)
    - web: Web-optimized (2400px) - default
    - original: Full resolution

    Auth can be provided via:
    - Authorization: Bearer <token> header
    - ?token=<token> query parameter (for Image components)
    """
    # Verify authentication
    await get_admin_from_token_or_query(db, authorization, token)

    stmt = (
        select(Photo).where(Photo.id == photo_id).options(selectinload(Photo.file_hash))
    )
    result = await db.execute(stmt)
    photo = result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    file_hash = photo.file_hash
    is_video = photo.is_video
    file_path = get_file_path(
        file_hash.sha256_hash, variant, file_hash.file_extension, is_video
    )

    if not file_path.exists():
        # Fallback to original if variant doesn't exist
        if variant != "original":
            file_path = get_file_path(
                file_hash.sha256_hash, "original", file_hash.file_extension, is_video
            )
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

    # For videos, use proper mime type; for images use webp for variants
    if is_video and variant != "thumbnail":
        media_type = file_hash.mime_type
    else:
        media_type = (
            "image/webp" if variant in ("thumbnail", "web") else file_hash.mime_type
        )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=31536000",  # 1 year, but private (requires auth)
        },
    )


@router.get("/hash/{file_hash}")
async def get_authenticated_file_by_hash(
    file_hash: str,
    variant: str = Query("web", pattern="^(original|thumbnail|web)$"),
    token: str | None = Query(
        None, description="JWT auth token (alternative to Authorization header)"
    ),
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a file by its hash. Requires admin authentication.
    Used for cover photos and other direct hash references.
    """
    # Verify authentication
    await get_admin_from_token_or_query(db, authorization, token)

    stmt = select(FileHash).where(FileHash.sha256_hash == file_hash)
    result = await db.execute(stmt)
    fh = result.scalar_one_or_none()

    if not fh:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = get_file_path(file_hash, variant, fh.file_extension)

    if not file_path.exists():
        if variant != "original":
            file_path = get_file_path(file_hash, "original", fh.file_extension)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

    media_type = "image/webp" if variant in ("thumbnail", "web") else fh.mime_type

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=31536000",
        },
    )


# --- Public Share File Access (Token validated) ---


async def get_share_link_by_token_or_slug(
    identifier: str, db: AsyncSession
) -> ShareLink | None:
    """
    Find a share link by token or custom slug.
    Checks custom_slug first (for friendly URLs), then falls back to token.
    """
    from sqlalchemy import or_

    stmt = select(ShareLink).where(
        or_(ShareLink.custom_slug == identifier, ShareLink.token == identifier),
        ~ShareLink.is_revoked,  # SQLAlchemy NOT operator
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.get("/share/{share_token}/photo/{photo_id}")
async def get_shared_photo(
    share_token: str,
    photo_id: uuid.UUID,
    variant: str = Query("web", pattern="^(original|thumbnail|web)$"),
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a photo from a shared album. Requires valid share token or custom slug.
    If share link is password protected, password must be provided.
    """
    # Validate share link (supports both token and custom slug)
    share_link = await get_share_link_by_token_or_slug(share_token, db)

    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found or revoked")

    # Check expiration
    if share_link.expires_at:
        from datetime import datetime, timezone

        if datetime.now(timezone.utc) > share_link.expires_at:
            raise HTTPException(status_code=410, detail="Share link has expired")

    # Check password
    if share_link.is_password_protected:
        if not password:
            raise HTTPException(status_code=401, detail="Password required")
        if not verify_password(password, share_link.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")

    # Verify photo belongs to shared album
    photo_stmt = (
        select(Photo)
        .where(Photo.id == photo_id, Photo.album_id == share_link.album_id)
        .options(selectinload(Photo.file_hash))
    )
    photo_result = await db.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found in shared album")

    file_hash = photo.file_hash
    is_video = photo.is_video
    file_path = get_file_path(
        file_hash.sha256_hash, variant, file_hash.file_extension, is_video
    )

    if not file_path.exists():
        if variant != "original":
            file_path = get_file_path(
                file_hash.sha256_hash, "original", file_hash.file_extension, is_video
            )
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

    # For videos, use proper mime type; for images use webp for variants
    if is_video and variant != "thumbnail":
        media_type = file_hash.mime_type
    else:
        media_type = (
            "image/webp" if variant in ("thumbnail", "web") else file_hash.mime_type
        )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            # Public cache is OK for shared files since token is validated
            "Cache-Control": "public, max-age=86400",  # 1 day
        },
    )


@router.get("/share/{share_token}/hash/{file_hash}")
async def get_shared_file_by_hash(
    share_token: str,
    file_hash: str,
    variant: str = Query("web", pattern="^(original|thumbnail|web)$"),
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a file by hash from a shared album. Used for cover photos.
    Supports both token and custom slug.
    """
    # Validate share link (supports both token and custom slug)
    share_link = await get_share_link_by_token_or_slug(share_token, db)

    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")

    # Check expiration
    if share_link.expires_at:
        from datetime import datetime, timezone

        if datetime.now(timezone.utc) > share_link.expires_at:
            raise HTTPException(status_code=410, detail="Share link has expired")

    # Check password
    if share_link.is_password_protected:
        if not password:
            raise HTTPException(status_code=401, detail="Password required")
        if not verify_password(password, share_link.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")

    # Verify the file hash belongs to a photo in the shared album
    photo_stmt = (
        select(Photo)
        .join(FileHash, Photo.file_hash_id == FileHash.id)
        .where(Photo.album_id == share_link.album_id, FileHash.sha256_hash == file_hash)
    )
    photo_result = await db.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="File not found in shared album")

    # Get file hash record for extension
    fh_stmt = select(FileHash).where(FileHash.sha256_hash == file_hash)
    fh_result = await db.execute(fh_stmt)
    fh = fh_result.scalar_one_or_none()

    if not fh:
        raise HTTPException(status_code=404, detail="File not found")

    is_video = photo.is_video
    file_path = get_file_path(file_hash, variant, fh.file_extension, is_video)

    if not file_path.exists():
        if variant != "original":
            file_path = get_file_path(
                file_hash, "original", fh.file_extension, is_video
            )
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

    # For videos, use proper mime type; for images use webp for variants
    if is_video and variant != "thumbnail":
        media_type = fh.mime_type
    else:
        media_type = "image/webp" if variant in ("thumbnail", "web") else fh.mime_type

    return FileResponse(
        path=file_path,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )
