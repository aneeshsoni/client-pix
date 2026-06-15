"""API models for people and face recognition endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from models.api.albums_api_models import PhotoResponse


class FaceBoxResponse(BaseModel):
    """Normalized face bounding box."""

    left: float = Field(..., ge=0, le=1)
    top: float = Field(..., ge=0, le=1)
    width: float = Field(..., ge=0, le=1)
    height: float = Field(..., ge=0, le=1)


class FaceDetectionResponse(BaseModel):
    """Detected face details."""

    id: uuid.UUID
    file_hash_id: uuid.UUID
    bbox: FaceBoxResponse
    confidence: float
    quality: float
    created_at: datetime


class PersonResponse(BaseModel):
    """Person summary."""

    id: uuid.UUID
    display_name: str
    hidden: bool
    cover_face_id: uuid.UUID | None
    face_count: int
    photo_count: int
    created_at: datetime
    updated_at: datetime


class PersonDetailResponse(PersonResponse):
    """Person detail with photos and detected faces."""

    photos: list[PhotoResponse]
    faces: list[FaceDetectionResponse]


class PeopleListResponse(BaseModel):
    """List of detected people."""

    people: list[PersonResponse]
    total_count: int


class PersonUpdate(BaseModel):
    """Person update payload."""

    display_name: str | None = Field(None, min_length=1, max_length=120)
    hidden: bool | None = None
    cover_face_id: uuid.UUID | None = None


class PersonMergeRequest(BaseModel):
    """Merge other people into the target person."""

    source_person_ids: list[uuid.UUID] = Field(..., min_length=1)


class PersonFacesAddRequest(BaseModel):
    """Manually assign detected faces to a person."""

    face_ids: list[uuid.UUID] = Field(..., min_length=1)


class FaceScanBackfillRequest(BaseModel):
    """Request to enqueue a library backfill."""

    force: bool = False


class FaceScanBackfillResponse(BaseModel):
    """Backfill enqueue summary."""

    queued_count: int
    skipped_count: int
    total_count: int


class FaceScanStatusResponse(BaseModel):
    """Face scan queue and backend status."""

    enabled: bool
    ready: bool
    model_version: str
    reason: str | None
    total_images: int
    queued: int
    processing: int
    completed: int
    failed: int
    skipped: int
    last_error: str | None = None


class FaceScanRetryResponse(BaseModel):
    """Retry failed jobs response."""

    retried_count: int
