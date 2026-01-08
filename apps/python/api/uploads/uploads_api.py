"""Upload API endpoints."""

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.api.uploads_api_models import UploadResponse, UploadMultipleResponse
from models.db.file_hash_db_models import FileHash
from services.storage_service import storage_service

router = APIRouter()


async def _create_or_update_file_hash(
    db: AsyncSession,
    result,
) -> FileHash:
    """Create a new FileHash record or increment reference count if exists."""
    # Check if hash already exists in database
    stmt = select(FileHash).where(FileHash.sha256_hash == result.file_id)
    existing = await db.execute(stmt)
    file_hash = existing.scalar_one_or_none()

    if file_hash:
        # Increment reference count for existing file
        file_hash.reference_count += 1
    else:
        # Create new file hash record
        file_hash = FileHash(
            sha256_hash=result.file_id,
            storage_path=result.storage_path,
            file_extension=result.file_extension,
            mime_type=result.mime_type,
            file_size=result.file_size,
            width=result.width or 0,
            height=result.height or 0,
            reference_count=1,
        )
        db.add(file_hash)

    await db.commit()
    await db.refresh(file_hash)
    return file_hash


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a single file.

    Streams the file to disk efficiently - supports large files (videos, RAW images).
    Images are deduplicated by SHA256 hash. Videos get a unique UUID.
    """
    result = await storage_service.store_file_streaming(
        file=file.file,
        original_filename=file.filename or "unnamed",
    )

    # Save to database (skip for videos since they use UUID not hash)
    if not result.is_video:
        await _create_or_update_file_hash(db, result)

    return UploadResponse(
        file_id=result.file_id,
        storage_path=result.storage_path,
        file_extension=result.file_extension,
        mime_type=result.mime_type,
        file_size=result.file_size,
        width=result.width,
        height=result.height,
        is_duplicate=result.is_duplicate,
        is_video=result.is_video,
    )


@router.post("/upload/multiple", response_model=UploadMultipleResponse)
async def upload_multiple_files(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload multiple files at once.

    Each file is streamed to disk individually.
    """
    uploaded = []
    duplicate_count = 0

    for file in files:
        result = await storage_service.store_file_streaming(
            file=file.file,
            original_filename=file.filename or "unnamed",
        )

        if result.is_duplicate:
            duplicate_count += 1

        # Save to database (skip for videos)
        if not result.is_video:
            await _create_or_update_file_hash(db, result)

        uploaded.append(
            UploadResponse(
                file_id=result.file_id,
                storage_path=result.storage_path,
                file_extension=result.file_extension,
                mime_type=result.mime_type,
                file_size=result.file_size,
                width=result.width,
                height=result.height,
                is_duplicate=result.is_duplicate,
                is_video=result.is_video,
            )
        )

    return UploadMultipleResponse(
        uploaded=uploaded,
        total_count=len(uploaded),
        duplicate_count=duplicate_count,
    )
