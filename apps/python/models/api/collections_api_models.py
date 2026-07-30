"""API models for album collections."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from models.api.share_links_api_models import SharedAlbumResponse


class CollectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    access_level: Literal["public", "private"] = "public"
    password: str | None = Field(None, min_length=8, max_length=100)
    album_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_private_password(self) -> "CollectionCreate":
        if self.access_level == "private" and not self.password:
            raise ValueError("Private collections require a password")
        return self


class CollectionUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    access_level: Literal["public", "private"] | None = None
    password: str | None = Field(None, min_length=8, max_length=100)
    album_ids: list[uuid.UUID] | None = None


class CollectionAlbumResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    slug: str
    cover_photo_id: uuid.UUID | None
    cover_photo_position_x: float
    cover_photo_position_y: float
    photo_count: int


class CollectionResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    token: str
    share_url: str
    access_level: Literal["public", "private"]
    album_count: int
    albums: list[CollectionAlbumResponse]
    created_at: datetime
    updated_at: datetime


class CollectionListResponse(BaseModel):
    collections: list[CollectionResponse]
    total_count: int


class CollectionAccessRequest(BaseModel):
    password: str | None = None


class CollectionInfoResponse(BaseModel):
    title: str
    description: str | None
    is_password_protected: bool
    album_count: int


class SharedCollectionResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    is_password_protected: bool
    requires_password: bool
    albums: list[CollectionAlbumResponse]


class SharedCollectionAlbumResponse(SharedAlbumResponse):
    """Shared album response reached through a collection."""
