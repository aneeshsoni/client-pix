"""API models for upload capabilities and settings."""

from pydantic import BaseModel, Field


class UploadCapabilities(BaseModel):
    max_file_bytes: int
    resumable_threshold_bytes: int = 50 * 1024 * 1024
    chunk_size_bytes: int
    resumable_uploads: bool = True


class UploadLimitValue(BaseModel):
    max_file_bytes: int
    max_file_bytes_cap: int


class UploadSettingsResponse(BaseModel):
    admin_upload: UploadLimitValue
    shared_upload: UploadLimitValue
    resumable_threshold_bytes: int = 50 * 1024 * 1024
    chunk_size_bytes: int


class UploadSettingsUpdate(BaseModel):
    max_upload_file_bytes: int = Field(gt=0)
    max_shared_upload_file_bytes: int = Field(gt=0)
