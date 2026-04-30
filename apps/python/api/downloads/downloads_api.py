"""Download preparation and serving endpoints."""

from core.config import UPLOAD_DIR
from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models.api.downloads_api_models import (
    DownloadJobResponse,
    PrepareDownloadRequest,
)
from models.db.admin_db_models import Admin
from models.db.album_db_models import Album
from models.db.photo_db_models import Photo
from services.download_service import download_service
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from utils.auth_util import get_admin_from_token_or_query
from utils.download_util import ResumableFileResponse

router = APIRouter(prefix="/downloads", tags=["downloads"])


def _job_to_response(job, download_url: str | None = None) -> DownloadJobResponse:
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


@router.post("/prepare", response_model=DownloadJobResponse)
async def prepare_download(
    data: PrepareDownloadRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    """Prepare a download (creates ZIP in background if not cached)."""
    # Verify album exists
    album_stmt = select(Album).where(Album.id == data.album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Fetch photos
    photos_stmt = (
        select(Photo)
        .where(Photo.album_id == data.album_id)
        .options(selectinload(Photo.file_hash))
    )
    if data.photo_ids:
        photos_stmt = photos_stmt.where(Photo.id.in_(data.photo_ids))

    photos_result = await db.execute(photos_stmt)
    photos = photos_result.scalars().all()

    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    photo_ids = [str(pid) for pid in data.photo_ids] if data.photo_ids else None

    job = download_service.prepare_download(
        album_id=str(data.album_id),
        album_title=album.title,
        photos=photos,
        upload_dir=UPLOAD_DIR,
        photo_ids=photo_ids,
    )

    download_url = str(request.url_for("download_file", job_id=job.job_id))
    return _job_to_response(job, download_url)


@router.post("/prepare-all-albums", response_model=DownloadJobResponse)
async def prepare_all_albums_download(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    """Prepare a consolidated ZIP with one folder per album."""
    albums_stmt = (
        select(Album)
        .options(selectinload(Album.photos).selectinload(Photo.file_hash))
        .order_by(Album.created_at.desc())
    )
    albums_result = await db.execute(albums_stmt)
    albums = albums_result.scalars().unique().all()

    if not albums:
        raise HTTPException(status_code=404, detail="No albums found")

    job = download_service.prepare_multi_album_download(
        albums=albums,
        upload_dir=UPLOAD_DIR,
    )

    if job.status == "failed":
        raise HTTPException(status_code=404, detail=job.error or "No files found")

    download_url = str(request.url_for("download_file", job_id=job.job_id))
    return _job_to_response(job, download_url)


@router.get("/status/{job_id}", response_model=DownloadJobResponse)
async def get_download_status(
    job_id: str,
    request: Request,
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    """Poll for download job status."""
    job = download_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Download job not found")

    download_url = str(request.url_for("download_file", job_id=job.job_id))
    return _job_to_response(job, download_url)


@router.get("/{job_id}/file")
async def download_file(
    job_id: str,
    request: Request,
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    """Download the prepared ZIP file."""
    job = download_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Download job not found")

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
