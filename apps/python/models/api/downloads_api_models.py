"""API models for download endpoints."""

import uuid

from pydantic import BaseModel


class PrepareDownloadRequest(BaseModel):
    """Request to prepare a download."""

    album_id: uuid.UUID
    photo_ids: list[uuid.UUID] | None = None


class PrepareShareDownloadRequest(BaseModel):
    """Request to prepare a download from a shared album."""

    password: str | None = None


class DownloadJobResponse(BaseModel):
    """Response for download job status."""

    job_id: str
    status: str  # queued | processing | ready | failed
    progress: int = 0
    total_files: int = 0
    processed_files: int = 0
    zip_size: int = 0
    download_url: str | None = None
    error: str | None = None
