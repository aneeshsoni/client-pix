from pydantic import BaseModel


class HealthCheckResponse(BaseModel):
    status: str
    message: str


class StorageInfo(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    used_percentage: float


class TempFilesInfo(BaseModel):
    """Information about orphaned temporary files."""

    download_files_count: int
    download_files_bytes: int
    upload_temp_files_count: int
    upload_temp_files_bytes: int
    chunked_uploads_count: int
    chunked_uploads_bytes: int
    total_bytes: int


class CleanupResult(BaseModel):
    """Result of a cleanup operation."""

    cleaned_count: int
    cleaned_bytes: int
    message: str
