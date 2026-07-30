"""API models for album endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


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
    cover_photo_position_x: float | None = Field(None, ge=0, le=100)
    cover_photo_position_y: float | None = Field(None, ge=0, le=100)


class PhotoTagCreate(BaseModel):
    """Request to create an album photo tag."""

    name: str | None = Field(None, max_length=100)
    emoji: str | None = Field(None, max_length=16)
    color: str | None = Field(None, max_length=32)
    sort_order: int = 0

    @model_validator(mode="after")
    def validate_tag_content(self) -> "PhotoTagCreate":
        """Require at least one visible tag marker."""
        self.name = self.name.strip() if self.name else None
        self.emoji = self.emoji.strip() if self.emoji else None
        self.color = self.color.strip() if self.color else None
        if not self.name and not self.emoji and not self.color:
            raise ValueError("A tag needs a name, emoji, or color")
        return self


class PhotoTagUpdate(BaseModel):
    """Request to update an album photo tag."""

    name: str | None = Field(None, max_length=100)
    emoji: str | None = Field(None, max_length=16)
    color: str | None = Field(None, max_length=32)
    sort_order: int | None = None


class PhotoTagAssignmentUpdate(BaseModel):
    """Request to replace a photo's tag assignments."""

    tag_ids: list[uuid.UUID] = Field(default_factory=list)


# --- Response Models ---


class PhotoTagResponse(BaseModel):
    """Photo tag details in API response."""

    id: uuid.UUID
    album_id: uuid.UUID
    name: str | None
    emoji: str | None
    color: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PhotoResponse(BaseModel):
    """Photo details in API response."""

    id: uuid.UUID
    album_id: uuid.UUID | None
    original_filename: str
    caption: str | None
    sort_order: int
    captured_at: datetime | None = None
    is_video: bool = False
    # File details (from file_hash)
    storage_path: str
    thumbnail_path: str
    web_path: str
    width: int
    height: int
    file_size: int
    mime_type: str
    created_at: datetime
    updated_at: datetime
    tags: list[PhotoTagResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class VideoThumbnailUpdate(BaseModel):
    """Selected video frame to use as the poster thumbnail."""

    timestamp_seconds: float = Field(ge=0, allow_inf_nan=False)


class AlbumResponse(BaseModel):
    """Album details in API response."""

    id: uuid.UUID
    title: str
    description: str | None
    slug: str
    cover_photo_id: uuid.UUID | None
    cover_photo_thumbnail: str | None  # Path to cover photo thumbnail
    cover_photo_position_x: float
    cover_photo_position_y: float
    photo_count: int
    share_status: str | None = None  # None, "public", or "password"
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlbumDetailResponse(AlbumResponse):
    """Album with photos included."""

    photos: list[PhotoResponse]
    tags: list[PhotoTagResponse] = Field(default_factory=list)


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
