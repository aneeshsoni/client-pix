"""API models for upload endpoints."""

from pydantic import BaseModel


class UploadResponse(BaseModel):
    """Response after uploading a file."""

    file_id: str
    storage_path: str
    file_extension: str
    mime_type: str
    file_size: int
    width: int | None
    height: int | None
    is_duplicate: bool
    is_video: bool


class UploadMultipleResponse(BaseModel):
    """Response after uploading multiple files."""

    uploaded: list[UploadResponse]
    total_count: int
    duplicate_count: int
