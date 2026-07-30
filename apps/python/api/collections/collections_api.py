"""Admin and public APIs for shareable album collections."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from models.api.collections_api_models import (
    CollectionAccessRequest,
    CollectionCreate,
    CollectionInfoResponse,
    CollectionListResponse,
    CollectionResponse,
    CollectionUpdate,
    SharedCollectionResponse,
)
from models.api.share_links_api_models import SharedAlbumResponse
from models.db.album_db_models import Album
from models.db.collection_db_models import Collection, CollectionAlbum
from models.db.photo_db_models import Photo
from services.collection_service import (
    build_collection_album_response,
    build_shared_collection_album,
    get_collection_by_token,
    require_collection_album,
    validate_collection_password,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from utils.auth_util import get_admin_from_token_or_query
from utils.security_util import generate_token, hash_password

from core.database import get_db

router = APIRouter(
    prefix="/collections",
    tags=["collections"],
    dependencies=[Depends(get_admin_from_token_or_query)],
)
public_router = APIRouter(prefix="/collection-share", tags=["collection-public"])


def _collection_share_url(collection: Collection, request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get(
        "x-forwarded-host", request.headers.get("host", "localhost")
    )
    return f"{scheme}://{host}/collection/{collection.token}"


async def _load_collection(collection_id: uuid.UUID, db: AsyncSession) -> Collection:
    result = await db.execute(
        select(Collection)
        .where(Collection.id == collection_id)
        .execution_options(populate_existing=True)
        .options(
            selectinload(Collection.album_links)
            .selectinload(CollectionAlbum.album)
            .selectinload(Album.photos)
            .selectinload(Photo.file_hash)
        )
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection


def _build_collection_response(
    collection: Collection, request: Request
) -> CollectionResponse:
    albums = [
        build_collection_album_response(link.album) for link in collection.album_links
    ]
    return CollectionResponse(
        id=collection.id,
        title=collection.title,
        description=collection.description,
        token=collection.token,
        share_url=_collection_share_url(collection, request),
        access_level=collection.access_level,
        album_count=len(albums),
        albums=albums,
        created_at=collection.created_at,
        updated_at=collection.updated_at,
    )


async def _replace_collection_albums(
    collection: Collection,
    album_ids: list[uuid.UUID],
    db: AsyncSession,
) -> None:
    if len(set(album_ids)) != len(album_ids):
        raise HTTPException(
            status_code=400, detail="An album can only appear once in a collection"
        )
    if album_ids:
        result = await db.execute(select(Album.id).where(Album.id.in_(album_ids)))
        existing_ids = set(result.scalars().all())
        missing_ids = set(album_ids) - existing_ids
        if missing_ids:
            raise HTTPException(
                status_code=404, detail="One or more albums were not found"
            )

    await db.execute(
        delete(CollectionAlbum).where(CollectionAlbum.collection_id == collection.id)
    )
    for sort_order, album_id in enumerate(album_ids):
        db.add(
            CollectionAlbum(
                collection_id=collection.id,
                album_id=album_id,
                sort_order=sort_order,
            )
        )


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    data: CollectionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    collection = Collection(
        title=data.title.strip(),
        description=data.description,
        token=generate_token(),
        access_level=data.access_level,
        password_hash=hash_password(data.password) if data.password else None,
    )
    db.add(collection)
    await db.flush()
    await _replace_collection_albums(collection, data.album_ids, db)
    await db.commit()
    return _build_collection_response(
        await _load_collection(collection.id, db), request
    )


@router.get("", response_model=CollectionListResponse)
async def list_collections(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Collection)
        .options(
            selectinload(Collection.album_links)
            .selectinload(CollectionAlbum.album)
            .selectinload(Album.photos)
            .selectinload(Photo.file_hash)
        )
        .order_by(Collection.created_at.desc())
    )
    collections = result.scalars().all()
    return CollectionListResponse(
        collections=[
            _build_collection_response(collection, request)
            for collection in collections
        ],
        total_count=len(collections),
    )


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return _build_collection_response(
        await _load_collection(collection_id, db), request
    )


@router.patch("/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: uuid.UUID,
    data: CollectionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    collection = await _load_collection(collection_id, db)
    if data.title is not None:
        collection.title = data.title.strip()
    if "description" in data.model_fields_set:
        collection.description = data.description
    if data.access_level is not None:
        if (
            data.access_level == "private"
            and not data.password
            and not collection.password_hash
        ):
            raise HTTPException(
                status_code=400,
                detail="A password is required to make this collection private",
            )
        collection.access_level = data.access_level
        if data.access_level == "public":
            collection.password_hash = None
    if data.password is not None:
        collection.password_hash = hash_password(data.password)
        collection.access_level = "private"
    if data.album_ids is not None:
        await _replace_collection_albums(collection, data.album_ids, db)

    await db.commit()
    return _build_collection_response(
        await _load_collection(collection.id, db), request
    )


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(
    collection_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    collection = await _load_collection(collection_id, db)
    await db.delete(collection)
    await db.commit()


@public_router.get("/{token}/info", response_model=CollectionInfoResponse)
async def get_collection_info(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    collection = await get_collection_by_token(token, db, load_albums=True)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return CollectionInfoResponse(
        title=collection.title,
        description=collection.description,
        is_password_protected=collection.access_level == "private",
        album_count=len(collection.album_links),
    )


@public_router.post("/{token}/access", response_model=SharedCollectionResponse)
async def access_collection(
    token: str,
    data: CollectionAccessRequest,
    db: AsyncSession = Depends(get_db),
):
    collection = await get_collection_by_token(token, db, load_albums=True)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    validate_collection_password(collection, data.password)
    return SharedCollectionResponse(
        id=collection.id,
        title=collection.title,
        description=collection.description,
        is_password_protected=collection.access_level == "private",
        requires_password=False,
        albums=[
            build_collection_album_response(link.album)
            for link in collection.album_links
        ],
    )


@public_router.post(
    "/{token}/albums/{album_id}/access",
    response_model=SharedAlbumResponse,
)
async def access_collection_album(
    token: str,
    album_id: uuid.UUID,
    data: CollectionAccessRequest,
    sort_by: str = Query("captured", pattern="^(captured|uploaded)$"),
    sort_dir: str = Query("default", pattern="^(asc|desc|default)$"),
    db: AsyncSession = Depends(get_db),
):
    collection = await get_collection_by_token(token, db)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    validate_collection_password(collection, data.password)
    album = await require_collection_album(collection.id, album_id, db)
    return await build_shared_collection_album(album, db, sort_by, sort_dir)
