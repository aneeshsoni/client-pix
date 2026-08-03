"""API models for optional adaptive video playback."""

import uuid

from pydantic import BaseModel


class VideoStreamingSettingsUpdate(BaseModel):
    enabled: bool


class VideoStreamingSettingsResponse(BaseModel):
    available: bool
    enabled: bool
    pending_jobs: int
    processing_jobs: int
    ready_videos: int
    failed_jobs: int
    eligible_existing_videos: int
    rendition_bytes: int
    estimated_backfill_bytes: int


class VideoBackfillResponse(BaseModel):
    queued_count: int
    skipped_count: int
    estimated_additional_bytes: int


class VideoRenditionCleanupResponse(BaseModel):
    deleted_renditions: int
    reclaimed_bytes: int


class VideoQualityResponse(BaseModel):
    id: str
    label: str
    width: int
    height: int
    playlist_url: str | None = None
    is_source: bool = False


class VideoPlaybackResponse(BaseModel):
    enabled: bool
    status: str
    source: VideoQualityResponse
    qualities: list[VideoQualityResponse]
    manifest_url: str | None = None
    error: str | None = None
    progress: int | None = None


class PublicVideoPlaybackRequest(BaseModel):
    password: str | None = None


class VideoProcessingStatusResponse(BaseModel):
    photo_id: uuid.UUID
    status: str
    progress: int
    error: str | None = None
    rendition_bytes: int = 0
