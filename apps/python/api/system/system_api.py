import glob
import os
import shutil

from core.config import UPLOAD_DIR
from fastapi import APIRouter
from models.api.system_api_models import (
    CleanupResult,
    HealthCheckResponse,
    StorageInfo,
    TempFilesInfo,
)

router = APIRouter()


@router.get("/system/health", response_model=HealthCheckResponse)
async def health_check():
    return {"status": "healthy", "message": "System is running"}


@router.get("/system/storage", response_model=StorageInfo)
async def get_storage_info():
    """Get storage information for the entire filesystem."""
    # Get disk usage statistics for the entire filesystem
    # (using UPLOAD_DIR just to determine which filesystem to check)
    total, used, free = shutil.disk_usage(UPLOAD_DIR)

    used_percentage = (used / total * 100) if total > 0 else 0

    return StorageInfo(
        total_bytes=total,
        used_bytes=used,
        free_bytes=free,
        used_percentage=round(used_percentage, 2),
    )


def _get_download_temp_stats() -> tuple[int, int]:
    """Get stats for orphaned download ZIP files in /tmp."""
    count = 0
    total_bytes = 0
    for pattern in ["/tmp/*.zip", "/tmp/tmp*.zip"]:
        for filepath in glob.glob(pattern):
            try:
                total_bytes += os.path.getsize(filepath)
                count += 1
            except (OSError, FileNotFoundError):
                pass
    return count, total_bytes


def _get_upload_temp_stats() -> tuple[int, int]:
    """Get stats for orphaned temp_* upload files."""
    count = 0
    total_bytes = 0
    temp_pattern = str(UPLOAD_DIR / "temp_*")
    for filepath in glob.glob(temp_pattern):
        try:
            total_bytes += os.path.getsize(filepath)
            count += 1
        except (OSError, FileNotFoundError):
            pass
    return count, total_bytes


def _get_chunked_upload_stats() -> tuple[int, int]:
    """Get stats for orphaned chunked upload directories."""
    count = 0
    total_bytes = 0
    chunks_dir = UPLOAD_DIR / "chunks"
    if chunks_dir.exists():
        for upload_session_dir in chunks_dir.iterdir():
            if not upload_session_dir.is_dir():
                continue
            try:
                dir_size = sum(
                    f.stat().st_size
                    for f in upload_session_dir.rglob("*")
                    if f.is_file()
                )
                total_bytes += dir_size
                count += 1
            except (OSError, FileNotFoundError):
                pass
    return count, total_bytes


@router.get("/system/temp-files", response_model=TempFilesInfo)
async def get_temp_files_info():
    """Get information about orphaned temporary files."""
    download_count, download_bytes = _get_download_temp_stats()
    upload_count, upload_bytes = _get_upload_temp_stats()
    chunked_count, chunked_bytes = _get_chunked_upload_stats()

    return TempFilesInfo(
        download_files_count=download_count,
        download_files_bytes=download_bytes,
        upload_temp_files_count=upload_count,
        upload_temp_files_bytes=upload_bytes,
        chunked_uploads_count=chunked_count,
        chunked_uploads_bytes=chunked_bytes,
        total_bytes=download_bytes + upload_bytes + chunked_bytes,
    )


@router.post("/system/cleanup/downloads", response_model=CleanupResult)
async def cleanup_download_temp_files():
    """Manually clean up orphaned download ZIP files."""
    count = 0
    total_bytes = 0
    for pattern in ["/tmp/*.zip", "/tmp/tmp*.zip"]:
        for filepath in glob.glob(pattern):
            try:
                size = os.path.getsize(filepath)
                os.unlink(filepath)
                total_bytes += size
                count += 1
            except (OSError, FileNotFoundError):
                pass

    return CleanupResult(
        cleaned_count=count,
        cleaned_bytes=total_bytes,
        message=f"Cleaned {count} download temp files",
    )


@router.post("/system/cleanup/uploads", response_model=CleanupResult)
async def cleanup_upload_temp_files():
    """Manually clean up orphaned upload temp files and chunked uploads."""
    count = 0
    total_bytes = 0

    # Clean temp_* files
    temp_pattern = str(UPLOAD_DIR / "temp_*")
    for filepath in glob.glob(temp_pattern):
        try:
            size = os.path.getsize(filepath)
            os.unlink(filepath)
            total_bytes += size
            count += 1
        except (OSError, FileNotFoundError):
            pass

    # Clean chunked upload directories
    chunks_dir = UPLOAD_DIR / "chunks"
    if chunks_dir.exists():
        for upload_session_dir in chunks_dir.iterdir():
            if not upload_session_dir.is_dir():
                continue
            try:
                dir_size = sum(
                    f.stat().st_size
                    for f in upload_session_dir.rglob("*")
                    if f.is_file()
                )
                shutil.rmtree(upload_session_dir)
                total_bytes += dir_size
                count += 1
            except (OSError, FileNotFoundError):
                pass

    return CleanupResult(
        cleaned_count=count,
        cleaned_bytes=total_bytes,
        message=f"Cleaned {count} upload temp files/directories",
    )
