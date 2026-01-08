"""Utilities for file downloads with resumable support."""

import os
from pathlib import Path

from fastapi import Request
from starlette.responses import Response


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
