import shutil

from fastapi import APIRouter

from core.config import UPLOAD_DIR
from models.api.system_api_models import HealthCheckResponse, StorageInfo

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
