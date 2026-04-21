"""Public share link access endpoints (no authentication required)."""

import uuid
from datetime import datetime, timezone

from core.config import UPLOAD_DIR
from core.database import get_db
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from models.api.albums_api_models import PhotoUploadResponse
from models.api.downloads_api_models import (
    DownloadJobResponse,
    PrepareShareDownloadRequest,
)
from models.api.share_links_api_models import (
    SharedAlbumPhotoResponse,
    SharedAlbumResponse,
    ShareLinkVerifyRequest,
)
from models.db.album_db_models import Album
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from models.db.share_link_db_models import ShareLink
from services.storage_service import storage_service
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from services.download_service import download_service
from utils.download_util import ResumableFileResponse, create_photos_zip
from utils.response_util import build_photo_response
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

    # Get cover photo ID for OG image (use photo ID so frontend can build proper share URL)
    cover_photo_id = None
    if album.cover_photo_id:
        # Use explicit cover photo
        cover_photo_id = str(album.cover_photo_id)
    elif album.photos:
        # Fall back to first photo as cover
        cover_photo_id = str(album.photos[0].id)

    return {
        "is_password_protected": share_link.is_password_protected,
        "allows_uploads": share_link.allows_uploads,
        "album_id": str(share_link.album_id),
        "album_title": album.title,
        "album_description": album.description,
        "cover_photo_id": cover_photo_id,
        "photo_count": len(album.photos),
    }


@router.post("/{token}/access", response_model=SharedAlbumResponse)
async def access_shared_album(
    token: str,
    data: ShareLinkVerifyRequest,
    sort_by: str = Query("captured", pattern="^(captured|uploaded)$"),
    sort_dir: str = Query("default", pattern="^(asc|desc|default)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Access a shared album. If password protected, the correct password must be provided.
    This endpoint is public and doesn't require authentication.

    The `token` parameter can be either the random token or a custom slug.
    - sort_by=captured (default): Sort by EXIF date, NULLs last, then upload date
    - sort_by=uploaded: Sort by upload date
    - sort_dir=asc|desc|default: Sort direction (default: captured=asc, uploaded=desc)
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
                allows_uploads=share_link.allows_uploads,
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

    # Sort photos based on sort_by and sort_dir parameters
    photos_list = list(album.photos)
    effective_dir = (
        sort_dir
        if sort_dir != "default"
        else ("asc" if sort_by == "captured" else "desc")
    )
    is_descending = effective_dir == "desc"

    if sort_by == "captured":
        photos_list.sort(
            key=lambda p: (
                p.captured_at is not None if is_descending else p.captured_at is None,
                p.captured_at or p.created_at,
            ),
            reverse=is_descending,
        )
    else:  # uploaded
        photos_list.sort(key=lambda p: p.created_at, reverse=is_descending)

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
        allows_uploads=share_link.allows_uploads,
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


def _validate_share_upload_allowed(share_link: ShareLink) -> None:
    """Ensure a share link is allowed to upload into its album."""
    if not share_link.allows_uploads:
        raise HTTPException(
            status_code=403,
            detail="Uploads are not allowed for this share link",
        )


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

    # Get album
    album_stmt = select(Album).where(Album.id == share_link.album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get photos with file_hash eagerly loaded
    photos_stmt = (
        select(Photo)
        .where(Photo.album_id == share_link.album_id)
        .options(selectinload(Photo.file_hash))
    )
    photos_result = await db.execute(photos_stmt)
    photos = photos_result.scalars().all()

    if not photos:
        raise HTTPException(status_code=404, detail="No photos in album")

    return create_photos_zip(photos, album.title, UPLOAD_DIR, request, background_tasks)


@router.post("/{token}/upload", response_model=PhotoUploadResponse)
async def upload_shared_photos(
    token: str,
    files: list[UploadFile] = File(...),
    password: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Upload photos into the shared album when the link allows uploads."""
    share_link = await _validate_share_link(token, password, db)
    _validate_share_upload_allowed(share_link)

    album_stmt = select(Album).where(Album.id == share_link.album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    needs_cover = album.cover_photo_id is None

    sort_stmt = select(func.max(Photo.sort_order)).where(
        Photo.album_id == share_link.album_id
    )
    sort_result = await db.execute(sort_stmt)
    max_sort = sort_result.scalar() or 0

    photos = []
    duplicate_count = 0
    first_photo_id = None
    first_image_id = None

    for i, file in enumerate(files):
        stored = await storage_service.store_file_streaming(
            file=file.file,
            original_filename=file.filename or "unnamed",
        )

        hash_stmt = select(FileHash).where(FileHash.sha256_hash == stored.file_id)
        hash_result = await db.execute(hash_stmt)
        file_hash = hash_result.scalar_one_or_none()

        if file_hash:
            existing_photo_stmt = select(Photo).where(
                Photo.album_id == share_link.album_id,
                Photo.file_hash_id == file_hash.id,
            )
            existing_photo_result = await db.execute(existing_photo_stmt)
            existing_photo = existing_photo_result.scalar_one_or_none()

            if existing_photo:
                duplicate_count += 1
                continue

            file_hash.reference_count += 1
        else:
            file_hash = FileHash(
                sha256_hash=stored.file_id,
                storage_path=stored.storage_path,
                file_extension=stored.file_extension,
                mime_type=stored.mime_type,
                file_size=stored.file_size,
                width=stored.width or 0,
                height=stored.height or 0,
                reference_count=1,
            )
            db.add(file_hash)
            await db.flush()

        photo = Photo(
            album_id=share_link.album_id,
            file_hash_id=file_hash.id,
            original_filename=file.filename or "unnamed",
            is_video=stored.is_video,
            sort_order=max_sort + i + 1,
            captured_at=stored.captured_at,
        )
        db.add(photo)
        await db.flush()
        await db.refresh(photo, ["file_hash"])

        if first_photo_id is None:
            first_photo_id = photo.id
        if first_image_id is None and not stored.is_video:
            first_image_id = photo.id

        photos.append(build_photo_response(photo))

    if needs_cover:
        cover_id = first_image_id or first_photo_id
        if cover_id:
            album.cover_photo_id = cover_id

    await db.commit()
    download_service.invalidate_cache(str(share_link.album_id))

    return PhotoUploadResponse(
        photos=photos,
        uploaded_count=len(photos),
        duplicate_count=duplicate_count,
    )


def _share_job_to_response(
    job, token: str, request: Request, password: str | None = None
) -> DownloadJobResponse:
    download_url = str(
        request.url_for("download_share_file", token=token, job_id=job.job_id)
    )
    if password:
        download_url += f"?password={password}"
    return DownloadJobResponse(
        job_id=job.job_id,
        status=job.status,
        progress=job.progress,
        total_files=job.total_files,
        processed_files=job.processed_files,
        zip_size=job.zip_size,
        download_url=download_url if job.status == "ready" else None,
        error=job.error,
    )


def _get_validated_share_job(job_id: str, expected_album_id: str):
    """Return a share download job only when it belongs to the validated album."""
    job = download_service.get_job(job_id)
    if not job or job.album_id != expected_album_id:
        raise HTTPException(status_code=404, detail="Download job not found")
    return job


@router.post("/{token}/prepare-download", response_model=DownloadJobResponse)
async def prepare_share_download(
    token: str,
    data: PrepareShareDownloadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Prepare a download for a shared album (creates ZIP in background if not cached)."""
    share_link = await _validate_share_link(token, data.password, db)

    # Get album
    album_stmt = select(Album).where(Album.id == share_link.album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get photos
    photos_stmt = (
        select(Photo)
        .where(Photo.album_id == share_link.album_id)
        .options(selectinload(Photo.file_hash))
    )
    photos_result = await db.execute(photos_stmt)
    photos = photos_result.scalars().all()

    if not photos:
        raise HTTPException(status_code=404, detail="No photos in album")

    job = download_service.prepare_download(
        album_id=str(share_link.album_id),
        album_title=album.title,
        photos=photos,
        upload_dir=UPLOAD_DIR,
    )

    return _share_job_to_response(job, token, request, data.password)


@router.get("/{token}/download-status/{job_id}", response_model=DownloadJobResponse)
async def get_share_download_status(
    token: str,
    job_id: str,
    request: Request,
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Poll for shared album download job status."""
    share_link = await _validate_share_link(token, password, db)
    job = _get_validated_share_job(job_id, str(share_link.album_id))

    return _share_job_to_response(job, token, request, password)


@router.get("/{token}/download-file/{job_id}")
async def download_share_file(
    token: str,
    job_id: str,
    request: Request,
    password: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Download the prepared ZIP file for a shared album."""
    share_link = await _validate_share_link(token, password, db)
    job = _get_validated_share_job(job_id, str(share_link.album_id))

    if job.status != "ready":
        raise HTTPException(status_code=409, detail="Download not ready yet")

    if not job.zip_path:
        raise HTTPException(status_code=500, detail="ZIP file path missing")

    safe_title = "".join(
        c if c.isalnum() or c in " -_" else "_" for c in job.album_title
    )
    zip_filename = f"{safe_title}.zip"

    return ResumableFileResponse(
        path=job.zip_path,
        filename=zip_filename,
        media_type="application/zip",
        request=request,
    )
