"""Resolve and update administrator-configurable upload limits."""

from dataclasses import dataclass

from core.config import (
    MAX_SHARED_UPLOAD_FILE_BYTES,
    MAX_SHARED_UPLOAD_FILE_BYTES_CAP,
    MAX_UPLOAD_FILE_BYTES,
    MAX_UPLOAD_FILE_BYTES_CAP,
)
from models.db.upload_settings_db_models import UploadSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class EffectiveUploadLimits:
    admin_bytes: int
    shared_bytes: int


async def get_upload_limits(db: AsyncSession) -> EffectiveUploadLimits:
    result = await db.execute(select(UploadSettings).where(UploadSettings.id == 1))
    settings = result.scalar_one_or_none()
    if settings is None:
        return EffectiveUploadLimits(
            admin_bytes=min(MAX_UPLOAD_FILE_BYTES, MAX_UPLOAD_FILE_BYTES_CAP),
            shared_bytes=min(
                MAX_SHARED_UPLOAD_FILE_BYTES,
                MAX_SHARED_UPLOAD_FILE_BYTES_CAP,
                MAX_UPLOAD_FILE_BYTES,
                MAX_UPLOAD_FILE_BYTES_CAP,
            ),
        )
    admin_bytes = min(settings.max_upload_file_bytes, MAX_UPLOAD_FILE_BYTES_CAP)
    return EffectiveUploadLimits(
        admin_bytes=admin_bytes,
        shared_bytes=min(
            settings.max_shared_upload_file_bytes,
            MAX_SHARED_UPLOAD_FILE_BYTES_CAP,
            admin_bytes,
        ),
    )


async def update_upload_limits(
    db: AsyncSession, admin_bytes: int, shared_bytes: int
) -> EffectiveUploadLimits:
    if admin_bytes > MAX_UPLOAD_FILE_BYTES_CAP:
        raise ValueError("Admin upload limit exceeds the server safety cap")
    if shared_bytes > MAX_SHARED_UPLOAD_FILE_BYTES_CAP:
        raise ValueError("Public share upload limit exceeds the server safety cap")
    if shared_bytes > admin_bytes:
        raise ValueError("Public share upload limit cannot exceed the admin limit")

    result = await db.execute(select(UploadSettings).where(UploadSettings.id == 1))
    settings = result.scalar_one_or_none()
    if settings is None:
        settings = UploadSettings(
            id=1,
            max_upload_file_bytes=admin_bytes,
            max_shared_upload_file_bytes=shared_bytes,
        )
        db.add(settings)
    else:
        settings.max_upload_file_bytes = admin_bytes
        settings.max_shared_upload_file_bytes = shared_bytes
    await db.commit()
    return EffectiveUploadLimits(admin_bytes=admin_bytes, shared_bytes=shared_bytes)
