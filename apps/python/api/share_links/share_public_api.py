"""Public share link access endpoints (no authentication required)."""

import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from core.config import UPLOAD_DIR
from core.database import get_db
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from models.api.share_links_api_models import (
    SharedAlbumPhotoResponse,
    SharedAlbumResponse,
    ShareLinkVerifyRequest,
)
from models.db.album_db_models import Album
from models.db.photo_db_models import Photo
from models.db.share_link_db_models import ShareLink
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from utils.download_util import ResumableFileResponse
from utils.security_util import verify_password

router = APIRouter(prefix="/share", tags=["share-public"])


async def get_share_link_by_token_or_slug(
    identifier: str, db: AsyncSession
) -> ShareLink | None:
    """
    Find a share link by token or custom slug.
    Checks custom_slug first (for friendly URLs), then falls back to token.
    """
    # Try custom slug first
    stmt = select(ShareLink).where(ShareLink.custom_slug == identifier)
    result = await db.execute(stmt)
    share_link = result.scalar_one_or_none()

    if share_link:
        return share_link

    # Fall back to token
    stmt = select(ShareLink).where(ShareLink.token == identifier)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.get("/{token}/info")
async def get_share_info(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get basic info about a share link (whether it requires password).
    This endpoint is public and doesn't require authentication.

    Returns album metadata for OG previews (title, description, cover image)
    even for password-protected albums.

    The `token` parameter can be either the random token or a custom slug.
    """
    share_link = await get_share_link_by_token_or_slug(token, db)

    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")

    # Check if revoked
    if share_link.is_revoked:
        raise HTTPException(status_code=410, detail="This share link has been revoked")

    # Check if expired
    if share_link.expires_at and share_link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This share link has expired")

    # Get album info for OG metadata (public preview even for password-protected albums)
    album_stmt = (
        select(Album)
        .where(Album.id == share_link.album_id)
        .options(selectinload(Album.photos).selectinload(Photo.file_hash))
    )
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get cover photo URL for OG image
    cover_photo_url = None
    if album.cover_photo_id:
        # Find the cover photo
        for photo in album.photos:
            if photo.id == album.cover_photo_id and photo.file_hash:
                hash_prefix = photo.file_hash.sha256_hash[:2]
                hash_subdir = photo.file_hash.sha256_hash[2:4]
                base_name = photo.file_hash.sha256_hash
                cover_photo_url = f"web/{hash_prefix}/{hash_subdir}/{base_name}.webp"
                break
    elif album.photos:
        # Fall back to first photo as cover
        first_photo = album.photos[0]
        if first_photo.file_hash:
            hash_prefix = first_photo.file_hash.sha256_hash[:2]
            hash_subdir = first_photo.file_hash.sha256_hash[2:4]
            base_name = first_photo.file_hash.sha256_hash
            cover_photo_url = f"web/{hash_prefix}/{hash_subdir}/{base_name}.webp"

    return {
        "is_password_protected": share_link.is_password_protected,
        "album_id": str(share_link.album_id),
        "album_title": album.title,
        "album_description": album.description,
        "cover_photo_url": cover_photo_url,
        "photo_count": len(album.photos),
    }


@router.post("/{token}/access", response_model=SharedAlbumResponse)
async def access_shared_album(
    token: str,
    data: ShareLinkVerifyRequest,
    sort_by: str = Query("captured", pattern="^(captured|uploaded)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Access a shared album. If password protected, the correct password must be provided.
    This endpoint is public and doesn't require authentication.

    The `token` parameter can be either the random token or a custom slug.
    - sort_by=captured (default): Sort by EXIF date (oldest first), NULLs last, then upload date
    - sort_by=uploaded: Sort by upload date (newest first)
    """
    share_link = await get_share_link_by_token_or_slug(token, db)

    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")

    # Check if revoked
    if share_link.is_revoked:
        raise HTTPException(status_code=410, detail="This share link has been revoked")

    # Check if expired
    if share_link.expires_at and share_link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This share link has expired")

    # Check password if required
    if share_link.is_password_protected:
        if not data.password:
            # Return minimal info indicating password is required
            return SharedAlbumResponse(
                id=share_link.album_id,
                title="",
                description=None,
                photo_count=0,
                photos=[],
                is_password_protected=True,
                requires_password=True,
            )

        if not share_link.password_hash or not verify_password(
            data.password, share_link.password_hash
        ):
            raise HTTPException(status_code=401, detail="Invalid password")

    # Get album with photos
    album_stmt = (
        select(Album)
        .where(Album.id == share_link.album_id)
        .options(selectinload(Album.photos).selectinload(Photo.file_hash))
    )
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Sort photos based on sort_by parameter
    photos_list = list(album.photos)
    if sort_by == "captured":
        # Sort by captured_at (oldest first), NULLs last, then by created_at
        photos_list.sort(
            key=lambda p: (
                p.captured_at is None,
                p.captured_at or p.created_at,
            )
        )
    else:  # uploaded
        # Sort by created_at (newest first)
        photos_list.sort(key=lambda p: p.created_at, reverse=True)

    # Build photo responses with paths from file_hash
    photos = []
    for photo in photos_list:
        if photo.file_hash:
            hash_prefix = photo.file_hash.sha256_hash[:2]
            hash_subdir = photo.file_hash.sha256_hash[2:4]
            base_name = photo.file_hash.sha256_hash

            photos.append(
                SharedAlbumPhotoResponse(
                    id=photo.id,
                    thumbnail_path=f"thumbnails/{hash_prefix}/{hash_subdir}/{base_name}.webp",
                    web_path=f"web/{hash_prefix}/{hash_subdir}/{base_name}.webp",
                    width=photo.file_hash.width or 0,
                    height=photo.file_hash.height or 0,
                    original_filename=photo.original_filename,
                    captured_at=photo.captured_at,
                    created_at=photo.created_at,
                    is_video=photo.is_video,
                )
            )

    return SharedAlbumResponse(
        id=album.id,
        title=album.title,
        description=album.description,
        photo_count=len(photos),
        photos=photos,
        is_password_protected=share_link.is_password_protected,
        requires_password=False,
    )


async def _validate_share_link(
    token: str,
    password: str | None,
    db: AsyncSession,
) -> ShareLink:
    """
    Validate a share link and return it if valid.
    The `token` can be either the random token or a custom slug.
    """
    share_link = await get_share_link_by_token_or_slug(token, db)

    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")

    if share_link.is_revoked:
        raise HTTPException(status_code=410, detail="This share link has been revoked")

    if share_link.expires_at and share_link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This share link has expired")

    if share_link.is_password_protected:
        if not password:
            raise HTTPException(status_code=401, detail="Password required")
        if not share_link.password_hash or not verify_password(
            password, share_link.password_hash
        ):
            raise HTTPException(status_code=401, detail="Invalid password")

    return share_link


@router.get("/{token}/download/{photo_id}")
async def download_shared_photo(
    token: str,
    photo_id: uuid.UUID,
    request: Request,
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Download a single photo from a shared album.
    Supports resumable downloads via HTTP Range headers.
    For password-protected links, pass the password as a query parameter.
    """
    share_link = await _validate_share_link(token, password, db)

    # Get the photo and verify it belongs to the shared album
    stmt = (
        select(Photo)
        .where(Photo.id == photo_id, Photo.album_id == share_link.album_id)
        .options(selectinload(Photo.file_hash))
    )
    result = await db.execute(stmt)
    photo = result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    file_hash = photo.file_hash
    file_path = UPLOAD_DIR / file_hash.storage_path

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return ResumableFileResponse(
        path=file_path,
        filename=photo.original_filename,
        media_type=file_hash.mime_type,
        request=request,
    )


def _cleanup_temp_file(path: str):
    """Background task to clean up temporary file."""
    try:
        os.unlink(path)
    except Exception:
        pass  # Ignore errors during cleanup


@router.get("/{token}/download-all")
async def download_all_shared_photos(
    token: str,
    request: Request,
    background_tasks: BackgroundTasks,
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Download all photos from a shared album as a ZIP file.
    Supports resumable downloads via HTTP Range headers.
    For password-protected links, pass the password as a query parameter.
    """
    share_link = await _validate_share_link(token, password, db)

    # Get album with photos
    album_stmt = (
        select(Album)
        .where(Album.id == share_link.album_id)
        .options(selectinload(Album.photos))
    )
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    if not album.photos:
        raise HTTPException(status_code=404, detail="No photos in album")

    # Collect file paths and names first
    files_to_zip: list[tuple[Path, str]] = []
    used_names: dict[str, int] = {}

    for photo in album.photos:
        await db.refresh(photo, ["file_hash"])
        if photo.file_hash:
            file_path = UPLOAD_DIR / photo.file_hash.storage_path
            if file_path.exists():
                # Handle duplicate filenames
                base_name = photo.original_filename
                if base_name in used_names:
                    used_names[base_name] += 1
                    name_parts = base_name.rsplit(".", 1)
                    if len(name_parts) == 2:
                        archive_name = (
                            f"{name_parts[0]}_{used_names[base_name]}.{name_parts[1]}"
                        )
                    else:
                        archive_name = f"{base_name}_{used_names[base_name]}"
                else:
                    used_names[base_name] = 0
                    archive_name = base_name

                files_to_zip.append((file_path, archive_name))

    if not files_to_zip:
        raise HTTPException(status_code=404, detail="No files available for download")

    # Create ZIP file on disk (temporary file)
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_path = temp_file.name
    temp_file.close()

    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_STORED) as zip_file:
            for file_path, archive_name in files_to_zip:
                zip_file.write(file_path, archive_name)
    except Exception as e:
        os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP: {str(e)}")

    # Create safe filename for the ZIP
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in album.title)
    zip_filename = f"{safe_title}.zip"

    # Schedule cleanup after response is sent
    background_tasks.add_task(_cleanup_temp_file, temp_path)

    return ResumableFileResponse(
        path=temp_path,
        filename=zip_filename,
        media_type="application/zip",
        request=request,
    )
