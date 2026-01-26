"""Utilities for file downloads with resumable support."""

import os
import tempfile
import zipfile
from pathlib import Path
from typing import Sequence

from fastapi import BackgroundTasks, HTTPException, Request
from starlette.responses import Response


async def cleanup_temp_file(path: str) -> None:
    """Background task to clean up temporary files."""
    try:
        os.unlink(path)
    except Exception:
        pass


def create_photos_zip(
    photos: Sequence,
    album_title: str,
    upload_dir: Path,
    request: Request,
    background_tasks: BackgroundTasks,
) -> "ResumableFileResponse":
    """
    Create a ZIP file from photos and return a resumable file response.

    Args:
        photos: Sequence of Photo objects with file_hash relationship loaded
        album_title: Title of the album (used for ZIP filename)
        upload_dir: Base directory where files are stored
        request: FastAPI request object (for ResumableFileResponse)
        background_tasks: FastAPI background tasks (for cleanup)

    Returns:
        ResumableFileResponse for streaming the ZIP file
    """
    # Collect file paths and names
    files_to_zip: list[tuple[Path, str]] = []
    used_names: dict[str, int] = {}

    for photo in photos:
        file_hash = photo.file_hash
        if not file_hash:
            continue

        file_path = upload_dir / file_hash.storage_path

        if file_path.exists():
            # Handle duplicate filenames
            base_name = photo.original_filename
            if base_name in used_names:
                used_names[base_name] += 1
                name_parts = base_name.rsplit(".", 1)
                if len(name_parts) == 2:
                    archive_name = (
                        f"{name_parts[0]}_{used_names[base_name]}.{name_parts[1]}"
                    )
                else:
                    archive_name = f"{base_name}_{used_names[base_name]}"
            else:
                used_names[base_name] = 0
                archive_name = base_name

            files_to_zip.append((file_path, archive_name))

    if not files_to_zip:
        raise HTTPException(status_code=404, detail="No files available for download")

    # Create ZIP file on disk (temporary file) - ZIP_STORED for speed (no compression)
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_path = temp_file.name
    temp_file.close()

    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_STORED) as zip_file:
            for file_path, archive_name in files_to_zip:
                zip_file.write(file_path, archive_name)
    except Exception as e:
        os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=f"Failed to create ZIP: {str(e)}")

    # Create safe filename for the ZIP
    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in album_title)
    zip_filename = f"{safe_title}.zip"

    # Schedule cleanup after response is sent
    background_tasks.add_task(cleanup_temp_file, temp_path)

    return ResumableFileResponse(
        path=temp_path,
        filename=zip_filename,
        media_type="application/zip",
        request=request,
    )


class ResumableFileResponse(Response):
    """
    A FileResponse that supports HTTP Range requests for resumable downloads.

    This is critical for mobile users where connections may drop.
    Supports:
    - Range header for partial content (206 response)
    - Accept-Ranges header to advertise support
    - Content-Range header in responses
    """

    chunk_size = 64 * 1024  # 64KB chunks

    def __init__(
        self,
        path: str | Path,
        filename: str,
        media_type: str,
        request: Request,
    ):
        self.path = Path(path)
        self.filename = filename
        self._media_type = media_type
        self.request = request

        # Get file info
        self.stat_result = os.stat(self.path)
        self.file_size = self.stat_result.st_size

        # Parse Range header
        self.start = 0
        self.end = self.file_size - 1
        self.status_code = 200

        range_header = request.headers.get("range")
        if range_header:
            self._parse_range(range_header)

        # Calculate content length
        self.content_length = self.end - self.start + 1

        # Build headers
        headers = {
            "accept-ranges": "bytes",
            "content-length": str(self.content_length),
            "content-disposition": f'attachment; filename="{self.filename}"',
        }

        if self.status_code == 206:
            headers["content-range"] = f"bytes {self.start}-{self.end}/{self.file_size}"

        super().__init__(
            content=None,
            status_code=self.status_code,
            headers=headers,
            media_type=self._media_type,
        )

    def _parse_range(self, range_header: str) -> None:
        """Parse the Range header and set start/end positions."""
        try:
            # Format: bytes=start-end or bytes=start- or bytes=-suffix
            if not range_header.startswith("bytes="):
                return

            range_spec = range_header[6:]  # Remove "bytes="

            if range_spec.startswith("-"):
                # Suffix range: last N bytes
                suffix_length = int(range_spec[1:])
                self.start = max(0, self.file_size - suffix_length)
                self.end = self.file_size - 1
            elif range_spec.endswith("-"):
                # Open-ended range: from start to end of file
                self.start = int(range_spec[:-1])
                self.end = self.file_size - 1
            else:
                # Explicit range: start-end
                parts = range_spec.split("-")
                self.start = int(parts[0])
                self.end = min(int(parts[1]), self.file_size - 1)

            # Validate range
            if self.start >= self.file_size or self.start > self.end:
                # Invalid range - return full file
                self.start = 0
                self.end = self.file_size - 1
                return

            self.status_code = 206

        except (ValueError, IndexError):
            # Invalid range header - return full file
            pass

    async def __call__(self, scope, receive, send) -> None:
        """Stream the file content."""
        await send(
            {
                "type": "http.response.start",
                "status": self.status_code,
                "headers": self.raw_headers,
            }
        )

        with open(self.path, "rb") as f:
            f.seek(self.start)
            remaining = self.content_length

            while remaining > 0:
                chunk_size = min(self.chunk_size, remaining)
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                remaining -= len(chunk)

                await send(
                    {
                        "type": "http.response.body",
                        "body": chunk,
                        "more_body": remaining > 0,
                    }
                )

        if remaining > 0:
            await send(
                {
                    "type": "http.response.body",
                    "body": b"",
                    "more_body": False,
                }
            )
