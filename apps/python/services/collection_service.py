"""Shared collection query and response helpers."""

import uuid

from fastapi import HTTPException
from models.api.collections_api_models import CollectionAlbumResponse
from models.api.share_links_api_models import (
    SharedAlbumPhotoResponse,
    SharedAlbumResponse,
    SharedPhotoTagResponse,
)
from models.db.album_db_models import Album
from models.db.collection_db_models import Collection, CollectionAlbum
from models.db.photo_db_models import Photo
from models.db.photo_tag_db_models import PhotoTag
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from utils.security_util import verify_password


async def get_collection_by_token(
    token: str, db: AsyncSession, *, load_albums: bool = False
) -> Collection | None:
    stmt = select(Collection).where(Collection.custom_slug == token)
    result = await db.execute(stmt)
    collection = result.scalar_one_or_none()
    if collection is not None:
        if load_albums:
            stmt = select(Collection).where(Collection.id == collection.id)
        else:
            return collection
    else:
        stmt = select(Collection).where(Collection.token == token)
    if load_albums:
        stmt = stmt.options(
            selectinload(Collection.album_links)
            .selectinload(CollectionAlbum.album)
            .selectinload(Album.photos)
            .selectinload(Photo.file_hash)
        )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


def validate_collection_password(collection: Collection, password: str | None) -> None:
    if collection.access_level != "private":
        return
    if not password:
        raise HTTPException(status_code=401, detail="Password required")
    if not collection.password_hash or not verify_password(
        password, collection.password_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid password")


async def require_collection_album(
    collection_id: uuid.UUID,
    album_id: uuid.UUID,
    db: AsyncSession,
) -> Album:
    result = await db.execute(
        select(Album)
        .join(CollectionAlbum, CollectionAlbum.album_id == Album.id)
        .where(
            CollectionAlbum.collection_id == collection_id,
            CollectionAlbum.album_id == album_id,
        )
    )
    album = result.scalar_one_or_none()
    if album is None:
        raise HTTPException(
            status_code=404, detail="Album not found in this collection"
        )
    return album


def build_collection_album_response(album: Album) -> CollectionAlbumResponse:
    return CollectionAlbumResponse(
        id=album.id,
        title=album.title,
        description=album.description,
        slug=album.slug,
        cover_photo_id=album.cover_photo_id,
        cover_photo_position_x=album.cover_photo_position_x,
        cover_photo_position_y=album.cover_photo_position_y,
        photo_count=len(album.photos),
    )


async def build_shared_collection_album(
    album: Album,
    db: AsyncSession,
    sort_by: str = "captured",
    sort_dir: str = "default",
) -> SharedAlbumResponse:
    result = await db.execute(
        select(Album)
        .where(Album.id == album.id)
        .options(
            selectinload(Album.photos).selectinload(Photo.file_hash),
            selectinload(Album.photos).selectinload(Photo.tags),
        )
    )
    loaded_album = result.scalar_one()
    photos_list = list(loaded_album.photos)
    effective_dir = (
        sort_dir
        if sort_dir != "default"
        else ("asc" if sort_by == "captured" else "desc")
    )
    descending = effective_dir == "desc"
    if sort_by == "captured":
        photos_list.sort(
            key=lambda photo: (
                photo.captured_at is not None
                if descending
                else photo.captured_at is None,
                photo.captured_at or photo.created_at,
            ),
            reverse=descending,
        )
    else:
        photos_list.sort(key=lambda photo: photo.created_at, reverse=descending)

    tag_result = await db.execute(
        select(PhotoTag)
        .where(PhotoTag.album_id == loaded_album.id)
        .order_by(PhotoTag.sort_order.asc(), PhotoTag.created_at.asc())
    )
    tags = [
        SharedPhotoTagResponse(
            id=tag.id,
            name=tag.name,
            emoji=tag.emoji,
            color=tag.color,
            sort_order=tag.sort_order,
        )
        for tag in tag_result.scalars().all()
    ]

    photos = []
    for photo in photos_list:
        if not photo.file_hash:
            continue
        photo_tags = sorted(
            photo.tags, key=lambda tag: (tag.sort_order, tag.created_at)
        )
        photos.append(
            SharedAlbumPhotoResponse(
                id=photo.id,
                thumbnail_path="",
                web_path="",
                width=photo.file_hash.width or 0,
                height=photo.file_hash.height or 0,
                original_filename=photo.original_filename,
                captured_at=photo.captured_at,
                created_at=photo.created_at,
                is_video=photo.is_video,
                tags=[
                    SharedPhotoTagResponse(
                        id=tag.id,
                        name=tag.name,
                        emoji=tag.emoji,
                        color=tag.color,
                        sort_order=tag.sort_order,
                    )
                    for tag in photo_tags
                ],
            )
        )

    return SharedAlbumResponse(
        id=loaded_album.id,
        title=loaded_album.title,
        description=loaded_album.description,
        photo_count=len(photos),
        photos=photos,
        tags=tags,
        is_password_protected=False,
        allows_uploads=False,
        requires_password=False,
    )
