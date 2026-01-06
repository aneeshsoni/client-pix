"""API models for album endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# --- Request Models ---


class AlbumCreate(BaseModel):
    """Request to create a new album."""

    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class AlbumUpdate(BaseModel):
    """Request to update an album."""

    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    cover_photo_id: uuid.UUID | None = None


# --- Response Models ---


class PhotoResponse(BaseModel):
    """Photo details in API response."""

    id: uuid.UUID
    album_id: uuid.UUID
    original_filename: str
    caption: str | None
    sort_order: int
    # File details (from file_hash)
    storage_path: str
    thumbnail_path: str
    web_path: str
    width: int
    height: int
    file_size: int
    mime_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AlbumResponse(BaseModel):
    """Album details in API response."""

    id: uuid.UUID
    title: str
    description: str | None
    slug: str
    cover_photo_id: uuid.UUID | None
    cover_photo_thumbnail: str | None  # Path to cover photo thumbnail
    photo_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlbumDetailResponse(AlbumResponse):
    """Album with photos included."""

    photos: list[PhotoResponse]


class AlbumListResponse(BaseModel):
    """List of albums."""

    albums: list[AlbumResponse]
    total_count: int


class PhotoUploadResponse(BaseModel):
    """Response after adding photos to an album."""

    photos: list[PhotoResponse]
    uploaded_count: int
    duplicate_count: int


class PhotoListResponse(BaseModel):
    """List of photos across all albums."""

    photos: list[PhotoResponse]
    total_count: int
