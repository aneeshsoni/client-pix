"""Response building utilities."""

from models.api.albums_api_models import AlbumResponse, PhotoResponse
from models.db.album_db_models import Album
from models.db.photo_db_models import Photo


def get_thumbnail_path_for_hash(sha256_hash: str) -> str:
    """Get the thumbnail path for a given file hash."""
    shard1 = sha256_hash[:2]
    shard2 = sha256_hash[2:4]
    return f"thumbnails/{shard1}/{shard2}/{sha256_hash}.webp"


def build_album_response(
    album: Album,
    photo_count: int,
    cover_photo_hash: str | None = None,
) -> AlbumResponse:
    """
    Build an AlbumResponse from an Album model.

    Args:
        album: The Album model
        photo_count: Number of photos in the album
        cover_photo_hash: SHA256 hash of the cover photo's file (if any)
    """
    cover_thumbnail = None
    if cover_photo_hash:
        cover_thumbnail = get_thumbnail_path_for_hash(cover_photo_hash)

    return AlbumResponse(
        id=album.id,
        title=album.title,
        description=album.description,
        slug=album.slug,
        cover_photo_id=album.cover_photo_id,
        cover_photo_thumbnail=cover_thumbnail,
        photo_count=photo_count,
        created_at=album.created_at,
        updated_at=album.updated_at,
    )


def build_photo_response(photo: Photo) -> PhotoResponse:
    """
    Build a PhotoResponse from a Photo model with file_hash data.

    Constructs paths for all image variants (original, thumbnail, web).
    For videos, thumbnail/web paths point to the generated poster frame.
    """
    file_hash = photo.file_hash
    shard1 = file_hash.sha256_hash[:2]
    shard2 = file_hash.sha256_hash[2:4]
    filename_base = file_hash.sha256_hash

    return PhotoResponse(
        id=photo.id,
        album_id=photo.album_id,
        original_filename=photo.original_filename,
        caption=photo.caption,
        sort_order=photo.sort_order,
        captured_at=photo.captured_at,
        is_video=photo.is_video,
        storage_path=file_hash.storage_path,
        thumbnail_path=f"thumbnails/{shard1}/{shard2}/{filename_base}.webp",
        web_path=f"web/{shard1}/{shard2}/{filename_base}.webp",
        width=file_hash.width,
        height=file_hash.height,
        file_size=file_hash.file_size,
        mime_type=file_hash.mime_type,
        created_at=photo.created_at,
    )
