"""Storage service for file handling with deduplication."""

import asyncio
import hashlib
import json
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime
from functools import partial
from pathlib import Path
from typing import BinaryIO

import aiofiles
from core.config import (
    FFMPEG_TIMEOUT_SECONDS,
    FFPROBE_TIMEOUT_SECONDS,
    MAX_IMAGE_PIXELS,
    MAX_UPLOAD_FILE_BYTES,
    THUMBNAIL_QUALITY,
    THUMBNAIL_SIZE,
    UPLOAD_DIR,
    VIDEO_THUMBNAIL_MAX_DIMENSION,
    WEB_MAX_DIMENSION,
    WEB_QUALITY,
)
from PIL import Image, ImageOps
from PIL.ExifTags import Base, IFD
from pillow_heif import register_heif_opener
from utils.upload_validation_util import (
    UploadRejectedError,
    validate_file_size_limit,
    validate_supported_filename,
)

# Chunk size for streaming (8MB - optimized for large RAW/video files)
CHUNK_SIZE = 8 * 1024 * 1024

# Background tasks for video thumbnail generation
_background_tasks: set[asyncio.Task] = set()


def _fit_within_max_dimension_filter(max_dimension: int) -> str:
    """Build an ffmpeg scale filter that fits either orientation within a box."""
    return (
        f"scale='if(gt(iw,ih),min({max_dimension},iw),-1)':"
        f"'if(gt(iw,ih),-1,min({max_dimension},ih))'"
    )


# Enable HEIC/HEIF decoding in Pillow.
register_heif_opener()
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


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
    captured_at: datetime | None = None  # EXIF date for images


class StorageService:
    """Handles file storage with SHA256-based deduplication for images."""

    VARIANT_ORIGINAL = "originals"
    VARIANT_THUMBNAIL = "thumbnails"
    VARIANT_WEB = "web"
    HEIF_EXTENSIONS = {".heic", ".heif"}

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

    def is_heif(self, extension: str) -> bool:
        """Check if extension is a HEIF-family format."""
        return extension.lower() in self.HEIF_EXTENSIONS

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

    def allowed_extensions(self) -> set[str]:
        """Return all supported media extensions."""
        return set(self.IMAGE_MIME_TYPES) | set(self.VIDEO_MIME_TYPES)

    def validate_supported_filename(self, filename: str) -> str:
        """Return the supported extension for an upload filename."""
        return validate_supported_filename(filename, self.allowed_extensions())

    async def store_prepared_file(
        self,
        prepared_path: Path,
        original_filename: str,
        max_file_size: int = MAX_UPLOAD_FILE_BYTES,
    ) -> StoredFile:
        """Finalize a resumable staging file without recopying large videos."""
        extension = self.validate_supported_filename(original_filename)
        file_size = prepared_path.stat().st_size
        validate_file_size_limit(file_size, max_file_size, original_filename)

        if not self.is_video(extension):
            async with aiofiles.open(prepared_path, "rb") as file:
                return await self.store_file_streaming(
                    file,
                    original_filename,
                    max_file_size,
                )

        file_id = uuid.uuid4().hex
        storage_path = self._get_video_path(file_id, extension)
        storage_path.parent.mkdir(parents=True, exist_ok=True)
        prepared_path.replace(storage_path)
        try:
            width, height = await self._get_video_dimensions(storage_path)
            if width <= 0 or height <= 0:
                raise UploadRejectedError(
                    "Unsupported or invalid video file",
                    status_code=415,
                    code="UNSUPPORTED_FILE_TYPE",
                    filename=original_filename,
                )
            self._schedule_background_thumbnails(storage_path, file_id)
            return StoredFile(
                file_id=file_id,
                storage_path=self._get_relative_video_path(file_id, extension),
                file_extension=extension,
                mime_type=self.get_mime_type(extension),
                file_size=file_size,
                width=width,
                height=height,
                is_duplicate=False,
                is_video=True,
            )
        except Exception:
            if storage_path.exists():
                storage_path.unlink()
            raise

    async def store_file_streaming(
        self,
        file: BinaryIO,
        original_filename: str,
        max_file_size: int = MAX_UPLOAD_FILE_BYTES,
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
        extension = self.validate_supported_filename(original_filename)

        # Handle videos differently - no hashing, use UUID
        if self.is_video(extension):
            return await self._store_video_streaming(file, extension, max_file_size)

        # For images: stream to temp, hash, then move
        return await self._store_image_streaming(file, extension, max_file_size)

    async def _store_video_streaming(
        self,
        file: BinaryIO,
        extension: str,
        max_file_size: int,
    ) -> StoredFile:
        """Store video file with streaming (no hashing).

        Thumbnail generation happens in background to avoid blocking uploads.
        """
        # Generate UUID for video
        file_id = uuid.uuid4().hex

        storage_path = self._get_video_path(file_id, extension)
        storage_path.parent.mkdir(parents=True, exist_ok=True)

        try:
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
                    validate_file_size_limit(file_size, max_file_size)

            validate_file_size_limit(file_size, max_file_size)

            # Get video dimensions quickly with ffprobe (fast operation)
            width, height = await self._get_video_dimensions(storage_path)
            if width <= 0 or height <= 0:
                raise UploadRejectedError(
                    "Unsupported or invalid video file",
                    status_code=415,
                )

            # Schedule thumbnail generation in background (don't block upload)
            self._schedule_background_thumbnails(storage_path, file_id)

            return StoredFile(
                file_id=file_id,
                storage_path=self._get_relative_video_path(file_id, extension),
                file_extension=extension,
                mime_type=self.get_mime_type(extension),
                file_size=file_size,
                width=width,
                height=height,
                is_duplicate=False,
                is_video=True,
            )
        except Exception:
            if storage_path.exists():
                storage_path.unlink()
            raise

    async def _store_image_streaming(
        self,
        file: BinaryIO,
        extension: str,
        max_file_size: int,
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
                    validate_file_size_limit(file_size, max_file_size)

            validate_file_size_limit(file_size, max_file_size)

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
                width, height = self._validate_image_dimensions(temp_path)

                # Move temp to final location
                storage_path.parent.mkdir(parents=True, exist_ok=True)
                temp_path.rename(storage_path)

                # Generate thumbnails for images
                await self._generate_thumbnails(storage_path, file_id, extension)

            # Get dimensions and EXIF date
            if is_duplicate:
                width, height = self._validate_image_dimensions(storage_path)
            captured_at = self.get_exif_date(storage_path)

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
                captured_at=captured_at,
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
                img = ImageOps.exif_transpose(img)
                return img.size
        except Exception:
            return self._get_dimensions_with_ffprobe(file_path)

    def _validate_image_dimensions(self, file_path: Path) -> tuple[int, int]:
        """Return dimensions only when the file probes as a real image."""
        width, height = self.get_image_dimensions(file_path)
        if width <= 0 or height <= 0:
            raise UploadRejectedError(
                "Unsupported or invalid image file",
                status_code=415,
            )
        return width, height

    def get_exif_date(self, file_path: Path) -> datetime | None:
        """Extract the captured date from EXIF data.

        Prioritizes DateTimeOriginal (when photo was taken) over DateTime (modify date).
        DateTimeOriginal is stored in the Exif sub-IFD, not the main IFD.
        """
        try:
            with Image.open(file_path) as img:
                exif = img.getexif()
                if not exif:
                    return None

                # DateTimeOriginal is in the Exif sub-IFD, not the main IFD
                exif_ifd = exif.get_ifd(IFD.Exif)
                if exif_ifd:
                    # Try DateTimeOriginal (tag 36867) - when photo was taken
                    date_original = exif_ifd.get(Base.DateTimeOriginal)
                    if date_original:
                        # Format: "2023:12:25 14:30:45"
                        return datetime.strptime(date_original, "%Y:%m:%d %H:%M:%S")

                    # Try DateTimeDigitized (tag 36868) as second choice
                    date_digitized = exif_ifd.get(Base.DateTimeDigitized)
                    if date_digitized:
                        return datetime.strptime(date_digitized, "%Y:%m:%d %H:%M:%S")

                # DateTime in main IFD is the modify date - only use as last resort
                # and only if we have no better option (not ideal for photos)
                date_time = exif.get(Base.DateTime)
                if date_time:
                    return datetime.strptime(date_time, "%Y:%m:%d %H:%M:%S")
        except Exception:
            pass
        return None

    def _generate_thumbnails_sync(
        self,
        original_path: Path,
        file_id: str,
        extension: str,
    ) -> None:
        """Generate thumbnail and web-optimized versions (synchronous)."""
        try:
            with Image.open(original_path) as img:
                # Apply EXIF orientation (iOS cameras store rotation in EXIF metadata)
                img = ImageOps.exif_transpose(img)

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
            print(f"Warning: Could not generate thumbnails for {original_path.name}")

    def _get_dimensions_with_ffprobe(self, file_path: Path) -> tuple[int, int]:
        """Get dimensions for formats Pillow cannot decode reliably."""
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "quiet",
                    "-print_format",
                    "json",
                    "-show_streams",
                    "-select_streams",
                    "v:0",
                    str(file_path),
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=FFPROBE_TIMEOUT_SECONDS,
            )
            if result.returncode == 0:
                probe_data = json.loads(result.stdout)
                if probe_data.get("streams"):
                    stream = probe_data["streams"][0]
                    return stream.get("width", 0), stream.get("height", 0)
        except Exception as e:
            print(f"Warning: Could not probe image dimensions: {e}")

        return (0, 0)

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
            partial(self._generate_thumbnails_sync, original_path, file_id, extension),
        )

    async def _get_video_dimensions(self, video_path: Path) -> tuple[int, int]:
        """Get video dimensions using ffprobe (fast operation)."""
        loop = asyncio.get_event_loop()

        try:
            probe_result = await loop.run_in_executor(
                None,
                partial(
                    subprocess.run,
                    [
                        "ffprobe",
                        "-v",
                        "quiet",
                        "-print_format",
                        "json",
                        "-show_streams",
                        "-select_streams",
                        "v:0",
                        str(video_path),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=FFPROBE_TIMEOUT_SECONDS,
                ),
            )
            if probe_result.returncode == 0:
                probe_data = json.loads(probe_result.stdout)
                if probe_data.get("streams"):
                    stream = probe_data["streams"][0]
                    return stream.get("width", 1920), stream.get("height", 1080)
        except Exception as e:
            print(f"Warning: Could not probe video dimensions: {e}")

        return 0, 0

    def _schedule_background_thumbnails(self, video_path: Path, file_id: str) -> None:
        """Schedule video thumbnail generation in background (non-blocking)."""
        try:
            loop = asyncio.get_event_loop()
            task = loop.create_task(
                self._generate_video_thumbnails_background(video_path, file_id)
            )
            # Keep reference to prevent garbage collection
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)
        except Exception as e:
            print(f"Warning: Could not schedule background thumbnail generation: {e}")

    async def _generate_video_thumbnails_background(
        self,
        video_path: Path,
        file_id: str,
    ) -> None:
        """Generate video thumbnails in background (called from background task)."""
        try:
            await self._generate_video_thumbnails(video_path, file_id)
            print(f"Background: Generated thumbnails for video {file_id}")
        except Exception as e:
            print(f"Background: Failed to generate thumbnails for {file_id}: {e}")

    async def _generate_video_thumbnails(
        self,
        video_path: Path,
        file_id: str,
        timestamp_seconds: float = 1.0,
    ) -> tuple[int, int]:
        """
        Generate thumbnail and web poster frames from video using ffmpeg.

        Returns (width, height) of the video.
        """
        loop = asyncio.get_event_loop()

        # Get video dimensions
        width, height = await self._get_video_dimensions(video_path)

        seek_timestamp = f"{timestamp_seconds:.3f}"

        # Generate the thumbnail poster at the selected frame.
        thumb_path = self._get_storage_path(file_id, self.VARIANT_THUMBNAIL, ".webp")
        thumb_temp_path = thumb_path.with_name(
            f"{thumb_path.stem}.{uuid.uuid4().hex}.tmp.webp"
        )
        thumb_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            result = await loop.run_in_executor(
                None,
                partial(
                    subprocess.run,
                    [
                        "ffmpeg",
                        "-y",  # Overwrite
                        "-ss",
                        seek_timestamp,
                        "-i",
                        str(video_path),
                        "-vframes",
                        "1",
                        "-vf",
                        _fit_within_max_dimension_filter(VIDEO_THUMBNAIL_MAX_DIMENSION),
                        "-q:v",
                        str(THUMBNAIL_QUALITY),
                        str(thumb_temp_path),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=FFMPEG_TIMEOUT_SECONDS,
                ),
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg thumbnail failed: {result.stderr}")
        except Exception as e:
            thumb_temp_path.unlink(missing_ok=True)
            raise RuntimeError(f"Could not generate video thumbnail: {e}") from e

        # Generate web version (larger poster)
        web_path = self._get_storage_path(file_id, self.VARIANT_WEB, ".webp")
        web_temp_path = web_path.with_name(
            f"{web_path.stem}.{uuid.uuid4().hex}.tmp.webp"
        )
        web_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            result = await loop.run_in_executor(
                None,
                partial(
                    subprocess.run,
                    [
                        "ffmpeg",
                        "-y",
                        "-ss",
                        seek_timestamp,
                        "-i",
                        str(video_path),
                        "-vframes",
                        "1",
                        "-vf",
                        _fit_within_max_dimension_filter(WEB_MAX_DIMENSION),
                        "-q:v",
                        str(WEB_QUALITY),
                        str(web_temp_path),
                    ],
                    capture_output=True,
                    text=True,
                    timeout=FFMPEG_TIMEOUT_SECONDS,
                ),
            )
            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg web poster failed: {result.stderr}")
            thumb_temp_path.replace(thumb_path)
            web_temp_path.replace(web_path)
        except Exception as e:
            raise RuntimeError(f"Could not generate video web poster: {e}") from e
        finally:
            thumb_temp_path.unlink(missing_ok=True)
            web_temp_path.unlink(missing_ok=True)

        return width, height

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

    async def set_video_thumbnail(
        self,
        file_id: str,
        extension: str,
        timestamp_seconds: float,
    ) -> bool:
        """Replace a video's poster images with the frame at the given timestamp."""
        video_path = self._get_video_path(file_id, extension)
        if not video_path.exists():
            return False

        await self._generate_video_thumbnails(
            video_path,
            file_id,
            timestamp_seconds=timestamp_seconds,
        )
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
