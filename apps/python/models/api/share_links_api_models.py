"""API models for share link endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ShareLinkCreate(BaseModel):
    """Request to create a share link."""

    password: str | None = Field(None, min_length=4, max_length=100)
    expires_at: datetime | None = None
    custom_slug: str | None = Field(
        None,
        min_length=3,
        max_length=100,
        pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$",
        description="Custom URL slug (lowercase letters, numbers, hyphens only)",
    )


class ShareLinkResponse(BaseModel):
    """Share link details in API response."""

    id: uuid.UUID
    album_id: uuid.UUID
    token: str
    custom_slug: str | None
    share_url: str
    is_password_protected: bool
    expires_at: datetime | None
    is_revoked: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ShareLinkListResponse(BaseModel):
    """List of share links for an album."""

    share_links: list[ShareLinkResponse]
    total_count: int


class ShareLinkUpdate(BaseModel):
    """Request to update a share link."""

    password: str | None = Field(None, min_length=4, max_length=100)
    expires_at: datetime | None = None
    is_revoked: bool | None = None
    custom_slug: str | None = Field(
        None,
        min_length=3,
        max_length=100,
        pattern=r"^[a-z0-9][a-z0-9-]*[a-z0-9]$",
        description="Custom URL slug (lowercase letters, numbers, hyphens only)",
    )


class ShareLinkVerifyRequest(BaseModel):
    """Request to verify/access a shared album."""

    password: str | None = None


class SharedAlbumPhotoResponse(BaseModel):
    """Photo details for shared album view (limited info)."""

    id: uuid.UUID
    thumbnail_path: str
    web_path: str
    width: int
    height: int
    original_filename: str
    captured_at: datetime | None = None
    created_at: datetime | None = None
    is_video: bool = False

    model_config = {"from_attributes": True}


class SharedAlbumResponse(BaseModel):
    """Shared album details (public view)."""

    id: uuid.UUID
    title: str
    description: str | None
    photo_count: int
    photos: list[SharedAlbumPhotoResponse]
    is_password_protected: bool
    requires_password: bool  # True if password required but not yet provided

    model_config = {"from_attributes": True}
