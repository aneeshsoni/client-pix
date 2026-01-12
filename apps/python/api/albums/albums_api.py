"""Album API endpoints."""

import io
import json
import shutil
import uuid
import zipfile
from pathlib import Path

import aiofiles
from core.config import UPLOAD_DIR
from core.database import get_db
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from models.api.albums_api_models import (
    AlbumCreate,
    AlbumDetailResponse,
    AlbumListResponse,
    AlbumResponse,
    AlbumUpdate,
    PhotoListResponse,
    PhotoUploadResponse,
)
from models.db.album_db_models import Album
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from services.storage_service import storage_service
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from utils.response_util import (
    build_album_response,
    build_photo_response,
    get_thumbnail_path_for_hash,
)
from utils.slug_util import generate_slug

# Directory for chunked uploads in progress
CHUNKS_DIR = UPLOAD_DIR / "chunks"
CHUNKS_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/albums", tags=["albums"])


# --- Album CRUD ---


@router.post("", response_model=AlbumResponse, status_code=201)
async def create_album(
    data: AlbumCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new album."""
    album = Album(
        title=data.title,
        description=data.description,
        slug=generate_slug(data.title),
    )
    db.add(album)
    await db.commit()
    await db.refresh(album)

    return build_album_response(album, photo_count=0, cover_photo_hash=None)


@router.get("", response_model=AlbumListResponse)
async def list_albums(
    db: AsyncSession = Depends(get_db),
):
    """List all albums with cover photo thumbnails."""
    # Get albums with photo count
    stmt = (
        select(Album, func.count(Photo.id).label("photo_count"))
        .outerjoin(Photo, Album.id == Photo.album_id)
        .group_by(Album.id)
        .order_by(Album.created_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    # Get cover photo hashes for albums that have cover photos
    album_ids_with_covers = [
        album.id for album, _ in rows if album.cover_photo_id is not None
    ]

    cover_hashes: dict[uuid.UUID, str] = {}
    if album_ids_with_covers:
        cover_stmt = (
            select(Photo.id, FileHash.sha256_hash)
            .join(FileHash, Photo.file_hash_id == FileHash.id)
            .where(
                Photo.id.in_(
                    [album.cover_photo_id for album, _ in rows if album.cover_photo_id]
                )
            )
        )
        cover_result = await db.execute(cover_stmt)
        cover_hashes = {row[0]: row[1] for row in cover_result.all()}

    albums = [
        build_album_response(
            album,
            photo_count=photo_count,
            cover_photo_hash=cover_hashes.get(album.cover_photo_id)
            if album.cover_photo_id
            else None,
        )
        for album, photo_count in rows
    ]

    return AlbumListResponse(albums=albums, total_count=len(albums))


@router.get("/{album_id}", response_model=AlbumDetailResponse)
async def get_album(
    album_id: uuid.UUID,
    sort_by: str = Query("captured", pattern="^(captured|uploaded)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get album details with photos.

    - sort_by=captured (default): Sort by EXIF date (oldest first), fallback to upload date
    - sort_by=uploaded: Sort by upload date (newest first)
    """
    # Get album first
    album_stmt = select(Album).where(Album.id == album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get photos with sorting
    if sort_by == "captured":
        # Sort by captured_at (oldest first), with NULL values last, then by created_at
        photos_stmt = (
            select(Photo)
            .where(Photo.album_id == album_id)
            .options(selectinload(Photo.file_hash))
            .order_by(Photo.captured_at.asc().nullslast(), Photo.created_at.asc())
        )
    else:  # uploaded
        photos_stmt = (
            select(Photo)
            .where(Photo.album_id == album_id)
            .options(selectinload(Photo.file_hash))
            .order_by(Photo.created_at.desc())
        )

    photos_result = await db.execute(photos_stmt)
    photos_list = photos_result.scalars().all()

    photos = [build_photo_response(photo) for photo in photos_list]

    # Get cover photo hash
    cover_hash = None
    if album.cover_photo_id:
        for photo in photos_list:
            if photo.id == album.cover_photo_id:
                cover_hash = photo.file_hash.sha256_hash
                break

    return AlbumDetailResponse(
        id=album.id,
        title=album.title,
        description=album.description,
        slug=album.slug,
        cover_photo_id=album.cover_photo_id,
        cover_photo_thumbnail=get_thumbnail_path_for_hash(cover_hash)
        if cover_hash
        else None,
        photo_count=len(photos),
        created_at=album.created_at,
        updated_at=album.updated_at,
        photos=photos,
    )


@router.get("/slug/{slug}", response_model=AlbumDetailResponse)
async def get_album_by_slug(
    slug: str,
    sort_by: str = Query("captured", pattern="^(captured|uploaded)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get album by slug (for public access).

    - sort_by=captured (default): Sort by EXIF date (oldest first), fallback to upload date
    - sort_by=uploaded: Sort by upload date (newest first)
    """
    # Get album first
    album_stmt = select(Album).where(Album.slug == slug)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Get photos with sorting
    if sort_by == "captured":
        photos_stmt = (
            select(Photo)
            .where(Photo.album_id == album.id)
            .options(selectinload(Photo.file_hash))
            .order_by(Photo.captured_at.asc().nullslast(), Photo.created_at.asc())
        )
    else:  # uploaded
        photos_stmt = (
            select(Photo)
            .where(Photo.album_id == album.id)
            .options(selectinload(Photo.file_hash))
            .order_by(Photo.created_at.desc())
        )

    photos_result = await db.execute(photos_stmt)
    photos_list = photos_result.scalars().all()

    photos = [build_photo_response(photo) for photo in photos_list]

    # Get cover photo hash
    cover_hash = None
    if album.cover_photo_id:
        for photo in photos_list:
            if photo.id == album.cover_photo_id:
                cover_hash = photo.file_hash.sha256_hash
                break

    return AlbumDetailResponse(
        id=album.id,
        title=album.title,
        description=album.description,
        slug=album.slug,
        cover_photo_id=album.cover_photo_id,
        cover_photo_thumbnail=get_thumbnail_path_for_hash(cover_hash)
        if cover_hash
        else None,
        photo_count=len(photos),
        created_at=album.created_at,
        updated_at=album.updated_at,
        photos=photos,
    )


@router.patch("/{album_id}", response_model=AlbumResponse)
async def update_album(
    album_id: uuid.UUID,
    data: AlbumUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update album details."""
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    if data.title is not None:
        album.title = data.title
        # Regenerate slug when title changes
        album.slug = generate_slug(data.title)
    if data.description is not None:
        album.description = data.description
    if data.cover_photo_id is not None:
        # Verify the photo belongs to this album
        photo_check = await db.execute(
            select(Photo).where(
                Photo.id == data.cover_photo_id,
                Photo.album_id == album_id,
            )
        )
        if not photo_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Photo not in this album")
        album.cover_photo_id = data.cover_photo_id

    await db.commit()
    await db.refresh(album)

    # Get photo count and cover hash
    count_stmt = select(func.count(Photo.id)).where(Photo.album_id == album_id)
    count_result = await db.execute(count_stmt)
    photo_count = count_result.scalar() or 0

    cover_hash = None
    if album.cover_photo_id:
        cover_stmt = (
            select(FileHash.sha256_hash)
            .join(Photo, Photo.file_hash_id == FileHash.id)
            .where(Photo.id == album.cover_photo_id)
        )
        cover_result = await db.execute(cover_stmt)
        cover_hash = cover_result.scalar_one_or_none()

    return build_album_response(
        album, photo_count=photo_count, cover_photo_hash=cover_hash
    )


@router.put("/{album_id}/cover/{photo_id}", response_model=AlbumResponse)
async def set_cover_photo(
    album_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Set a photo as the album cover."""
    # Verify album exists
    album_stmt = select(Album).where(Album.id == album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Verify photo belongs to this album
    photo_stmt = (
        select(Photo)
        .where(Photo.id == photo_id, Photo.album_id == album_id)
        .options(selectinload(Photo.file_hash))
    )
    photo_result = await db.execute(photo_stmt)
    photo = photo_result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found in this album")

    album.cover_photo_id = photo_id
    await db.commit()
    await db.refresh(album)

    # Get photo count
    count_stmt = select(func.count(Photo.id)).where(Photo.album_id == album_id)
    count_result = await db.execute(count_stmt)
    photo_count = count_result.scalar() or 0

    return build_album_response(
        album,
        photo_count=photo_count,
        cover_photo_hash=photo.file_hash.sha256_hash,
    )


@router.delete("/{album_id}", status_code=204)
async def delete_album(
    album_id: uuid.UUID,
    delete_photos: bool = Query(
        False,
        description="If true, permanently delete all photos. If false, photos become unassociated.",
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete an album.

    - delete_photos=false (default): Album is deleted, photos become unassociated (orphaned)
    - delete_photos=true: Album and all photos are permanently deleted from disk
    """
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Track files to delete after commit
    files_to_delete = []

    if delete_photos:
        # Get all photos with their file hashes for cleanup
        photos_stmt = (
            select(Photo)
            .where(Photo.album_id == album_id)
            .options(selectinload(Photo.file_hash))
        )
        photos_result = await db.execute(photos_stmt)
        photos = photos_result.scalars().all()

        # Decrement reference counts and mark files for deletion
        file_hashes_to_delete = []
        for photo in photos:
            file_hash = photo.file_hash
            file_hash.reference_count -= 1

            # If no more references, mark for deletion after commit
            if file_hash.reference_count <= 0:
                files_to_delete.append(
                    {
                        "file_id": file_hash.sha256_hash,
                        "extension": file_hash.file_extension,
                        "is_video": photo.is_video,
                    }
                )
                file_hashes_to_delete.append(file_hash)

        # Delete album FIRST (cascade will delete photo records)
        await db.delete(album)

        # Then delete orphaned file_hashes
        for file_hash in file_hashes_to_delete:
            await db.delete(file_hash)
    else:
        # Just unassociate photos from the album (set album_id to NULL)
        await db.execute(
            update(Photo).where(Photo.album_id == album_id).values(album_id=None)
        )
        # Delete the album
        await db.delete(album)

    # Commit DB changes first - if this fails, files remain intact
    await db.commit()

    # Delete files from disk AFTER successful commit
    for file_info in files_to_delete:
        try:
            await storage_service.delete_file(
                file_info["file_id"],
                file_info["extension"],
                file_info["is_video"],
            )
        except Exception as e:
            # Log but don't fail - DB is already consistent
            print(f"Warning: Failed to delete file {file_info['file_id']}: {e}")


# --- Chunked Upload for Large Files ---


@router.post("/{album_id}/upload/init")
async def init_chunked_upload(
    album_id: uuid.UUID,
    filename: str = Query(...),
    file_size: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Initialize a chunked upload session for a large file."""
    # Verify album exists
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Generate upload ID
    upload_id = uuid.uuid4().hex

    # Create directory for this upload's chunks
    upload_dir = CHUNKS_DIR / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "album_id": str(album_id),
        "filename": filename,
        "file_size": file_size,
        "chunks_received": [],
    }
    (upload_dir / "metadata.json").write_text(json.dumps(metadata))

    return {"upload_id": upload_id, "chunk_size": 1024 * 1024}  # 1MB chunks


@router.post("/{album_id}/upload/{upload_id}/chunk")
async def upload_chunk(
    album_id: uuid.UUID,
    upload_id: str,
    chunk_index: int = Query(...),
    request: Request = None,
):
    upload_dir = CHUNKS_DIR / upload_id
    if not upload_dir.exists():
        raise HTTPException(status_code=404, detail="Upload session not found")

    # Read the raw body (chunk data)
    chunk_data = await request.body()

    # Save chunk to disk
    chunk_path = upload_dir / f"chunk_{chunk_index:06d}"
    async with aiofiles.open(chunk_path, "wb") as f:
        await f.write(chunk_data)

    metadata_path = upload_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    if chunk_index not in metadata["chunks_received"]:
        metadata["chunks_received"].append(chunk_index)
        metadata_path.write_text(json.dumps(metadata))

    return {"chunk_index": chunk_index, "size": len(chunk_data)}


@router.post(
    "/{album_id}/upload/{upload_id}/complete", response_model=PhotoUploadResponse
)
async def complete_chunked_upload(
    album_id: uuid.UUID,
    upload_id: str,
    db: AsyncSession = Depends(get_db),
):
    upload_dir = CHUNKS_DIR / upload_id
    if not upload_dir.exists():
        raise HTTPException(status_code=404, detail="Upload session not found")

    # Load metadata
    metadata_path = upload_dir / "metadata.json"
    metadata = json.loads(metadata_path.read_text())

    if str(album_id) != metadata["album_id"]:
        raise HTTPException(status_code=400, detail="Album ID mismatch")

    # Verify album exists
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalar_one_or_none()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Assemble chunks into final file
    filename = metadata["filename"]
    extension = Path(filename).suffix.lower() or ".bin"
    temp_file = upload_dir / f"assembled{extension}"

    # Sort and concatenate chunks
    chunk_files = sorted(upload_dir.glob("chunk_*"))
    async with aiofiles.open(temp_file, "wb") as out_f:
        for chunk_path in chunk_files:
            async with aiofiles.open(chunk_path, "rb") as chunk_f:
                data = await chunk_f.read()
                await out_f.write(data)

    # Process the assembled file using storage service
    async with aiofiles.open(temp_file, "rb") as f:
        stored = await storage_service.store_file_streaming(
            file=f,
            original_filename=filename,
        )

    # Clean up chunks directory
    shutil.rmtree(upload_dir)

    # Check if album needs a cover photo
    needs_cover = album.cover_photo_id is None

    # Get current max sort_order
    sort_stmt = select(func.max(Photo.sort_order)).where(Photo.album_id == album_id)
    sort_result = await db.execute(sort_stmt)
    max_sort = sort_result.scalar() or 0

    # Get or create FileHash record
    hash_stmt = select(FileHash).where(FileHash.sha256_hash == stored.file_id)
    hash_result = await db.execute(hash_stmt)
    file_hash = hash_result.scalar_one_or_none()

    duplicate_count = 0
    if file_hash:
        file_hash.reference_count += 1
        duplicate_count = 1
    else:
        file_hash = FileHash(
            sha256_hash=stored.file_id,
            storage_path=stored.storage_path,
            file_extension=stored.file_extension,
            mime_type=stored.mime_type,
            file_size=stored.file_size,
            width=stored.width or 0,
            height=stored.height or 0,
            reference_count=1,
        )
        db.add(file_hash)
        await db.flush()

    # Create Photo record
    photo = Photo(
        album_id=album_id,
        file_hash_id=file_hash.id,
        original_filename=filename,
        is_video=stored.is_video,
        sort_order=max_sort + 1,
        captured_at=stored.captured_at,
    )
    db.add(photo)
    await db.flush()
    await db.refresh(photo, ["file_hash"])

    # Auto-set cover photo if needed (prefer images)
    if needs_cover and not stored.is_video:
        album.cover_photo_id = photo.id

    await db.commit()

    return PhotoUploadResponse(
        photos=[build_photo_response(photo)],
        uploaded_count=1,
        duplicate_count=duplicate_count,
    )


# --- Photo Management ---


@router.post("/{album_id}/photos", response_model=PhotoUploadResponse)
async def upload_photos_to_album(
    album_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload photos to an album. Auto-sets cover photo if album has none."""
    # Verify album exists
    stmt = select(Album).where(Album.id == album_id)
    result = await db.execute(stmt)
    album = result.scalar_one_or_none()

    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Check if album needs a cover photo
    needs_cover = album.cover_photo_id is None

    # Get current max sort_order for this album
    sort_stmt = select(func.max(Photo.sort_order)).where(Photo.album_id == album_id)
    sort_result = await db.execute(sort_stmt)
    max_sort = sort_result.scalar() or 0

    photos = []
    duplicate_count = 0
    first_photo_id = None
    first_image_id = None  # Track first image for cover (not video)

    for i, file in enumerate(files):
        # Store file on disk
        stored = await storage_service.store_file_streaming(
            file=file.file,
            original_filename=file.filename or "unnamed",
        )

        if stored.is_duplicate:
            duplicate_count += 1

        # Get or create FileHash record
        hash_stmt = select(FileHash).where(FileHash.sha256_hash == stored.file_id)
        hash_result = await db.execute(hash_stmt)
        file_hash = hash_result.scalar_one_or_none()

        if file_hash:
            file_hash.reference_count += 1
        else:
            file_hash = FileHash(
                sha256_hash=stored.file_id,
                storage_path=stored.storage_path,
                file_extension=stored.file_extension,
                mime_type=stored.mime_type,
                file_size=stored.file_size,
                width=stored.width or 0,
                height=stored.height or 0,
                reference_count=1,
            )
            db.add(file_hash)
            await db.flush()  # Get the ID

        # Create Photo record
        photo = Photo(
            album_id=album_id,
            file_hash_id=file_hash.id,
            original_filename=file.filename or "unnamed",
            is_video=stored.is_video,
            sort_order=max_sort + i + 1,
            captured_at=stored.captured_at,  # Store EXIF date (None for videos)
        )
        db.add(photo)
        await db.flush()
        await db.refresh(photo, ["file_hash"])

        # Track first photo for auto-cover (prefer images over videos)
        if first_photo_id is None:
            first_photo_id = photo.id
        if first_image_id is None and not stored.is_video:
            first_image_id = photo.id

        photos.append(build_photo_response(photo))

    # Auto-set cover photo to first image (or first video if no images)
    if needs_cover:
        cover_id = first_image_id or first_photo_id
        if cover_id:
            album.cover_photo_id = cover_id

    await db.commit()

    return PhotoUploadResponse(
        photos=photos,
        uploaded_count=len(photos),
        duplicate_count=duplicate_count,
    )


@router.delete("/{album_id}/photos/{photo_id}", status_code=204)
async def delete_photo(
    album_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a photo from an album."""
    stmt = (
        select(Photo)
        .where(Photo.id == photo_id, Photo.album_id == album_id)
        .options(selectinload(Photo.file_hash))
    )
    result = await db.execute(stmt)
    photo = result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Decrement file_hash reference count
    file_hash = photo.file_hash
    file_hash.reference_count -= 1

    # Capture file info before deletion (for cleanup after commit)
    files_to_delete = []
    should_delete_file_hash = file_hash.reference_count <= 0
    if should_delete_file_hash:
        files_to_delete.append(
            {
                "file_id": file_hash.sha256_hash,
                "extension": file_hash.file_extension,
                "is_video": photo.is_video,
            }
        )

    # Delete photo record FIRST (it references file_hash)
    await db.delete(photo)

    # Then delete file_hash if no more references
    if should_delete_file_hash:
        await db.delete(file_hash)

    # Commit DB changes first - if this fails, files remain intact
    await db.commit()

    # Delete files from disk AFTER successful commit
    # If this fails, we have orphaned files (less severe, can be cleaned up)
    for file_info in files_to_delete:
        try:
            await storage_service.delete_file(
                file_info["file_id"],
                file_info["extension"],
                file_info["is_video"],
            )
        except Exception as e:
            # Log but don't fail - DB is already consistent
            print(f"Warning: Failed to delete file {file_info['file_id']}: {e}")


@router.post("/{album_id}/photos/bulk-delete", status_code=204)
async def bulk_delete_photos(
    album_id: uuid.UUID,
    photo_ids: list[uuid.UUID],
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple photos from an album."""
    if not photo_ids:
        raise HTTPException(status_code=400, detail="No photo IDs provided")

    # Fetch all photos at once
    stmt = (
        select(Photo)
        .where(Photo.id.in_(photo_ids), Photo.album_id == album_id)
        .options(selectinload(Photo.file_hash))
    )
    result = await db.execute(stmt)
    photos = result.scalars().all()

    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    files_to_delete = []
    file_hashes_to_delete = []

    for photo in photos:
        # Decrement file_hash reference count
        file_hash = photo.file_hash
        file_hash.reference_count -= 1

        # Track files to delete if no more references
        if file_hash.reference_count <= 0:
            files_to_delete.append(
                {
                    "file_id": file_hash.sha256_hash,
                    "extension": file_hash.file_extension,
                    "is_video": photo.is_video,
                }
            )
            file_hashes_to_delete.append(file_hash)

        # Delete photo record
        await db.delete(photo)

    # Delete file_hash records with no more references
    for file_hash in file_hashes_to_delete:
        await db.delete(file_hash)

    # Commit DB changes first
    await db.commit()

    # Delete files from disk AFTER successful commit
    for file_info in files_to_delete:
        try:
            await storage_service.delete_file(
                file_info["file_id"],
                file_info["extension"],
                file_info["is_video"],
            )
        except Exception as e:
            print(f"Warning: Failed to delete file {file_info['file_id']}: {e}")


@router.get("/{album_id}/photos/{photo_id}/download")
async def download_photo(
    album_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Download a photo with its original filename."""
    stmt = (
        select(Photo)
        .where(Photo.id == photo_id, Photo.album_id == album_id)
        .options(selectinload(Photo.file_hash))
    )
    result = await db.execute(stmt)
    photo = result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    file_hash = photo.file_hash
    file_path = UPLOAD_DIR / file_hash.storage_path

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=file_path,
        filename=photo.original_filename,
        media_type=file_hash.mime_type,
    )


@router.post("/{album_id}/photos/bulk-download")
async def bulk_download_photos(
    album_id: uuid.UUID,
    photo_ids: list[uuid.UUID],
    db: AsyncSession = Depends(get_db),
):
    """Download multiple photos as a zip file."""
    if not photo_ids:
        raise HTTPException(status_code=400, detail="No photo IDs provided")

    # Fetch all photos at once
    stmt = (
        select(Photo)
        .where(Photo.id.in_(photo_ids), Photo.album_id == album_id)
        .options(selectinload(Photo.file_hash))
    )
    result = await db.execute(stmt)
    photos = result.scalars().all()

    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    # Get album name for zip filename
    album_stmt = select(Album).where(Album.id == album_id)
    album_result = await db.execute(album_stmt)
    album = album_result.scalar_one_or_none()
    album_name = album.name if album else "photos"

    # Create zip file in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        used_names = {}
        for photo in photos:
            file_hash = photo.file_hash
            file_path = UPLOAD_DIR / file_hash.storage_path

            if file_path.exists():
                # Handle duplicate filenames
                original_name = photo.original_filename
                if original_name in used_names:
                    used_names[original_name] += 1
                    name_parts = original_name.rsplit(".", 1)
                    if len(name_parts) == 2:
                        original_name = f"{name_parts[0]}_{used_names[original_name]}.{name_parts[1]}"
                    else:
                        original_name = f"{original_name}_{used_names[original_name]}"
                else:
                    used_names[original_name] = 0

                zip_file.write(file_path, original_name)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{album_name}_photos.zip"'
        },
    )


@router.post("/{album_id}/photos/{photo_id}/regenerate-thumbnails", status_code=200)
async def regenerate_photo_thumbnails(
    album_id: uuid.UUID,
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Regenerate thumbnails and web versions for a photo."""
    stmt = (
        select(Photo)
        .where(Photo.id == photo_id, Photo.album_id == album_id)
        .options(selectinload(Photo.file_hash))
    )
    result = await db.execute(stmt)
    photo = result.scalar_one_or_none()

    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    file_hash = photo.file_hash

    # Regenerate thumbnails
    success = await storage_service.regenerate_thumbnails(
        file_hash.sha256_hash,
        file_hash.file_extension,
    )

    if not success:
        raise HTTPException(status_code=404, detail="Original file not found on disk")

    return {"message": "Thumbnails regenerated successfully"}


@router.get("/photos/all", response_model=PhotoListResponse)
async def get_all_photos(
    sort_by: str = Query("captured", pattern="^(captured|uploaded)$"),
    db: AsyncSession = Depends(get_db),
):
    """Get all photos across all albums (excludes orphaned photos).

    - sort_by=captured (default): Sort by EXIF date (oldest first), NULLs last, then upload date
    - sort_by=uploaded: Sort by upload date (newest first)
    """
    if sort_by == "captured":
        stmt = (
            select(Photo)
            .where(Photo.album_id.isnot(None))  # Filter out orphaned photos
            .options(selectinload(Photo.file_hash))
            .order_by(
                Photo.captured_at.asc().nullslast(),
                Photo.created_at.asc(),
            )
        )
    else:
        stmt = (
            select(Photo)
            .where(Photo.album_id.isnot(None))
            .options(selectinload(Photo.file_hash))
            .order_by(Photo.created_at.desc())
        )

    result = await db.execute(stmt)
    photos = result.scalars().all()

    photos_response = [build_photo_response(photo) for photo in photos]

    return PhotoListResponse(
        photos=photos_response,
        total_count=len(photos_response),
    )
