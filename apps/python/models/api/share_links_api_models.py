"""API models for share link endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ShareLinkCreate(BaseModel):
    """Request to create a share link."""

    password: str | None = Field(None, min_length=4, max_length=100)
    expires_at: datetime | None = None


class ShareLinkResponse(BaseModel):
    """Share link details in API response."""

    id: uuid.UUID
    album_id: uuid.UUID
    token: str
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
