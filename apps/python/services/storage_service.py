"""Storage service for file handling with deduplication."""

import asyncio
import hashlib
import uuid
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import BinaryIO

import aiofiles
from PIL import Image

from core.config import (
    THUMBNAIL_SIZE,
    THUMBNAIL_QUALITY,
    UPLOAD_DIR,
    WEB_MAX_DIMENSION,
    WEB_QUALITY,
)


# Chunk size for streaming (8MB - optimized for large RAW/video files)
CHUNK_SIZE = 8 * 1024 * 1024


@dataclass
class StoredFile:
    """Result of storing a file."""

    file_id: str  # SHA256 for images, UUID for videos
    storage_path: str
    file_extension: str
    mime_type: str
    file_size: int
    width: int | None  # None for videos
    height: int | None  # None for videos
    is_duplicate: bool
    is_video: bool


class StorageService:
    """Handles file storage with SHA256-based deduplication for images."""

    VARIANT_ORIGINAL = "originals"
    VARIANT_THUMBNAIL = "thumbnails"
    VARIANT_WEB = "web"

    # Image MIME types
    IMAGE_MIME_TYPES = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".heic": "image/heic",
        ".heif": "image/heif",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
        ".bmp": "image/bmp",
        ".raw": "image/raw",
        ".cr2": "image/x-canon-cr2",
        ".cr3": "image/x-canon-cr3",
        ".nef": "image/x-nikon-nef",
        ".arw": "image/x-sony-arw",
    }

    # Video MIME types (skip hashing for these)
    VIDEO_MIME_TYPES = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
        ".m4v": "video/x-m4v",
        ".wmv": "video/x-ms-wmv",
        ".flv": "video/x-flv",
        ".mpeg": "video/mpeg",
        ".mpg": "video/mpeg",
        ".3gp": "video/3gpp",
        ".mts": "video/mp2t",
        ".m2ts": "video/mp2t",
    }

    def __init__(self, upload_dir: Path | None = None):
        self.upload_dir = upload_dir or UPLOAD_DIR
        self._ensure_directories()

    def _ensure_directories(self) -> None:
        """Create upload directories if they don't exist."""
        for variant in [
            self.VARIANT_ORIGINAL,
            self.VARIANT_THUMBNAIL,
            self.VARIANT_WEB,
        ]:
            (self.upload_dir / variant).mkdir(parents=True, exist_ok=True)
        # Videos get their own directory
        (self.upload_dir / "videos").mkdir(parents=True, exist_ok=True)

    def is_video(self, extension: str) -> bool:
        """Check if extension is a video format."""
        return extension.lower() in self.VIDEO_MIME_TYPES

    def is_image(self, extension: str) -> bool:
        """Check if extension is an image format."""
        return extension.lower() in self.IMAGE_MIME_TYPES

    def _get_storage_path(self, file_id: str, variant: str, extension: str) -> Path:
        """
        Get the storage path for a file based on its ID.

        Uses 2-level directory sharding: ab/cd/abcd1234...ext
        """
        shard1 = file_id[:2]
        shard2 = file_id[2:4]
        filename = f"{file_id}{extension}"
        return self.upload_dir / variant / shard1 / shard2 / filename

    def _get_video_path(self, file_id: str, extension: str) -> Path:
        """Get storage path for video files (no sharding needed)."""
        return self.upload_dir / "videos" / f"{file_id}{extension}"

    def _get_relative_path(self, file_id: str, variant: str, extension: str) -> str:
        """Get the relative path (for database storage)."""
        shard1 = file_id[:2]
        shard2 = file_id[2:4]
        filename = f"{file_id}{extension}"
        return f"{variant}/{shard1}/{shard2}/{filename}"

    def _get_relative_video_path(self, file_id: str, extension: str) -> str:
        """Get relative path for video files."""
        return f"videos/{file_id}{extension}"

    def get_mime_type(self, extension: str) -> str:
        """Get MIME type from file extension."""
        ext = extension.lower()
        if ext in self.IMAGE_MIME_TYPES:
            return self.IMAGE_MIME_TYPES[ext]
        if ext in self.VIDEO_MIME_TYPES:
            return self.VIDEO_MIME_TYPES[ext]
        return "application/octet-stream"

    async def store_file_streaming(
        self,
        file: BinaryIO,
        original_filename: str,
    ) -> StoredFile:
        """
        Store a file using streaming (memory-efficient for large files).

        - Images: Streams to temp file, computes SHA256, deduplicates
        - Videos: Streams directly to storage with UUID (no hashing)

        Args:
            file: File-like object supporting async read
            original_filename: Original filename for extension and metadata

        Returns:
            StoredFile with file details
        """
        extension = Path(original_filename).suffix.lower()
        if not extension:
            extension = ".bin"

        # Handle videos differently - no hashing, use UUID
        if self.is_video(extension):
            return await self._store_video_streaming(file, extension)

        # For images: stream to temp, hash, then move
        return await self._store_image_streaming(file, extension)

    async def _store_video_streaming(
        self,
        file: BinaryIO,
        extension: str,
    ) -> StoredFile:
        """Store video file with streaming (no hashing)."""
        # Generate UUID for video
        file_id = uuid.uuid4().hex

        storage_path = self._get_video_path(file_id, extension)
        storage_path.parent.mkdir(parents=True, exist_ok=True)

        # Stream directly to final location
        file_size = 0
        async with aiofiles.open(storage_path, "wb") as f:
            while True:
                # Support both sync and async read
                if hasattr(file, "read"):
                    chunk = file.read(CHUNK_SIZE)
                    # Handle coroutines from UploadFile
                    if hasattr(chunk, "__await__"):
                        chunk = await chunk
                else:
                    break

                if not chunk:
                    break

                await f.write(chunk)
                file_size += len(chunk)

        return StoredFile(
            file_id=file_id,
            storage_path=self._get_relative_video_path(file_id, extension),
            file_extension=extension,
            mime_type=self.get_mime_type(extension),
            file_size=file_size,
            width=None,
            height=None,
            is_duplicate=False,
            is_video=True,
        )

    async def _store_image_streaming(
        self,
        file: BinaryIO,
        extension: str,
    ) -> StoredFile:
        """Store image file with streaming and SHA256 deduplication."""
        # Stream to temp file while computing hash
        temp_path = self.upload_dir / f"temp_{uuid.uuid4().hex}{extension}"
        sha256 = hashlib.sha256()
        file_size = 0

        try:
            async with aiofiles.open(temp_path, "wb") as f:
                while True:
                    # Support both sync and async read
                    if hasattr(file, "read"):
                        chunk = file.read(CHUNK_SIZE)
                        if hasattr(chunk, "__await__"):
                            chunk = await chunk
                    else:
                        break

                    if not chunk:
                        break

                    await f.write(chunk)
                    sha256.update(chunk)
                    file_size += len(chunk)

            file_id = sha256.hexdigest()

            # Check for duplicate
            storage_path = self._get_storage_path(
                file_id, self.VARIANT_ORIGINAL, extension
            )
            is_duplicate = storage_path.exists()

            if is_duplicate:
                # File already exists, delete temp
                temp_path.unlink()
                # Check if thumbnails exist, generate if missing
                thumb_path = self._get_storage_path(
                    file_id, self.VARIANT_THUMBNAIL, ".webp"
                )
                web_path = self._get_storage_path(file_id, self.VARIANT_WEB, ".webp")
                if not thumb_path.exists() or not web_path.exists():
                    await self._generate_thumbnails(storage_path, file_id, extension)
            else:
                # Move temp to final location
                storage_path.parent.mkdir(parents=True, exist_ok=True)
                temp_path.rename(storage_path)

                # Generate thumbnails for images
                await self._generate_thumbnails(storage_path, file_id, extension)

            # Get dimensions
            width, height = self.get_image_dimensions(storage_path)

            return StoredFile(
                file_id=file_id,
                storage_path=self._get_relative_path(
                    file_id, self.VARIANT_ORIGINAL, extension
                ),
                file_extension=extension,
                mime_type=self.get_mime_type(extension),
                file_size=file_size,
                width=width,
                height=height,
                is_duplicate=is_duplicate,
                is_video=False,
            )

        except Exception:
            # Clean up temp file on error
            if temp_path.exists():
                temp_path.unlink()
            raise

    def get_image_dimensions(self, file_path: Path) -> tuple[int, int]:
        """Get width and height of an image."""
        try:
            with Image.open(file_path) as img:
                return img.size
        except Exception:
            return (0, 0)

    def _generate_thumbnails_sync(
        self,
        original_path: Path,
        file_id: str,
        extension: str,
    ) -> None:
        """Generate thumbnail and web-optimized versions (synchronous)."""
        try:
            with Image.open(original_path) as img:
                # Convert to RGB if necessary (for PNG with transparency, etc.)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")

                thumb = img.copy()
                thumb.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                thumb_path = self._get_storage_path(
                    file_id, self.VARIANT_THUMBNAIL, ".webp"
                )
                thumb_path.parent.mkdir(parents=True, exist_ok=True)
                thumb.save(thumb_path, "WEBP", quality=THUMBNAIL_QUALITY)

                web = img.copy()
                max_dim = WEB_MAX_DIMENSION
                if img.width > max_dim or img.height > max_dim:
                    if img.width > img.height:
                        new_width = max_dim
                        new_height = int((max_dim / img.width) * img.height)
                    else:
                        new_height = max_dim
                        new_width = int((max_dim / img.height) * img.width)
                    web = web.resize((new_width, new_height), Image.Resampling.LANCZOS)

                web_path = self._get_storage_path(file_id, self.VARIANT_WEB, ".webp")
                web_path.parent.mkdir(parents=True, exist_ok=True)
                web.save(web_path, "WEBP", quality=WEB_QUALITY)
        except Exception:
            # Non-standard image format, skip thumbnails
            pass

    async def _generate_thumbnails(
        self,
        original_path: Path,
        file_id: str,
        extension: str,
    ) -> None:
        """Generate thumbnail and web-optimized versions (async, runs in thread pool)."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            partial(self._generate_thumbnails_sync, original_path, file_id, extension)
        )

    def get_file_path(
        self,
        file_id: str,
        extension: str,
        variant: str = VARIANT_ORIGINAL,
        is_video: bool = False,
    ) -> Path:
        """Get the full path to a stored file."""
        if is_video:
            return self._get_video_path(file_id, extension)
        if variant == self.VARIANT_THUMBNAIL or variant == self.VARIANT_WEB:
            extension = ".webp"
        return self._get_storage_path(file_id, variant, extension)

    async def regenerate_thumbnails(self, file_id: str, extension: str) -> bool:
        """
        Regenerate thumbnails and web versions for an existing image.

        Returns True if successful, False if original file doesn't exist.
        """
        original_path = self._get_storage_path(
            file_id, self.VARIANT_ORIGINAL, extension
        )

        if not original_path.exists():
            return False

        await self._generate_thumbnails(original_path, file_id, extension)
        return True

    async def delete_file(
        self, file_id: str, extension: str, is_video: bool = False
    ) -> None:
        """Delete all variants of a file."""
        if is_video:
            path = self._get_video_path(file_id, extension)
            if path.exists():
                path.unlink()
            return

        for variant in [
            self.VARIANT_ORIGINAL,
            self.VARIANT_THUMBNAIL,
            self.VARIANT_WEB,
        ]:
            ext = extension if variant == self.VARIANT_ORIGINAL else ".webp"
            path = self._get_storage_path(file_id, variant, ext)
            if path.exists():
                path.unlink()


# Singleton instance
storage_service = StorageService()
