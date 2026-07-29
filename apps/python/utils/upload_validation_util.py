"""Validation helpers for upload request safety."""

import json
import math
import re
from pathlib import Path
from typing import Any

import aiofiles
from fastapi import HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse


class UploadRejectedError(ValueError):
    """Raised when an uploaded file or chunk should be rejected."""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        code: str = "UPLOAD_REJECTED",
        **context: Any,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.context = context


class UploadHTTPException(HTTPException):
    """HTTP exception that preserves both legacy and structured error fields."""

    def __init__(self, exc: UploadRejectedError):
        super().__init__(status_code=exc.status_code, detail=str(exc))
        self.code = exc.code
        self.context = exc.context


async def upload_http_exception_handler(
    _request: Request, exc: UploadHTTPException
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error": {
                "code": exc.code,
                "message": exc.detail,
                "retryable": False,
                **exc.context,
            },
        },
    )


def _format_bytes(size: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{size} B"
        size /= 1024
    return f"{size} B"


def upload_http_exception(exc: UploadRejectedError) -> HTTPException:
    """Convert an upload rejection into a client-facing HTTP error."""
    return UploadHTTPException(exc)


def validate_file_size_limit(
    file_size: int, max_file_size: int, filename: str | None = None
) -> None:
    """Reject empty or oversized files."""
    if file_size <= 0:
        raise UploadRejectedError(
            "Uploaded file is empty",
            code="EMPTY_FILE",
            filename=filename,
            file_size_bytes=file_size,
        )
    if file_size > max_file_size:
        raise UploadRejectedError(
            f"File exceeds the maximum allowed size of {_format_bytes(max_file_size)}",
            status_code=413,
            code="FILE_TOO_LARGE",
            filename=filename,
            file_size_bytes=file_size,
            max_file_size_bytes=max_file_size,
        )


def validate_upload_file_count(files: list[UploadFile], max_files: int | None) -> None:
    """Reject empty or overly large multipart upload batches."""
    if not files:
        raise UploadRejectedError("No files provided")
    if max_files is None:
        return
    if len(files) > max_files:
        raise UploadRejectedError(
            f"Too many files in one request. Maximum is {max_files}",
            status_code=413,
            code="TOO_MANY_FILES",
        )


def validate_supported_filename(
    filename: str,
    allowed_extensions: set[str],
) -> str:
    """Return the lower-case extension for supported upload filenames."""
    extension = Path(filename).suffix.lower()
    if not extension:
        raise UploadRejectedError(
            "Unsupported file type. Uploads must include a supported media extension",
            status_code=415,
            code="UNSUPPORTED_FILE_TYPE",
        )
    if extension not in allowed_extensions:
        allowed = ", ".join(sorted(allowed_extensions))
        raise UploadRejectedError(
            f"Unsupported file type '{extension}'. Allowed types: {allowed}",
            status_code=415,
            code="UNSUPPORTED_FILE_TYPE",
        )
    return extension


def get_chunk_upload_dir(chunks_dir: Path, upload_id: str) -> Path:
    """Validate an upload ID and return its chunk directory."""
    if not re.fullmatch(r"[a-f0-9]{32}", upload_id):
        raise HTTPException(status_code=404, detail="Upload session not found")
    return chunks_dir / upload_id


def load_chunk_metadata(metadata_path: Path) -> dict[str, Any]:
    """Load chunk metadata, failing safely when the session is corrupt."""
    try:
        metadata = json.loads(metadata_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=400, detail="Upload session is invalid"
        ) from exc

    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="Upload session is invalid")
    return metadata


def write_chunk_metadata(metadata_path: Path, metadata: dict[str, Any]) -> None:
    metadata_path.write_text(json.dumps(metadata))


def expected_chunk_count(file_size: int, chunk_size: int) -> int:
    return max(1, math.ceil(file_size / chunk_size))


def validate_chunk_index(chunk_index: int, file_size: int, chunk_size: int) -> None:
    """Reject chunk indexes outside the declared upload bounds."""
    max_chunks = expected_chunk_count(file_size, chunk_size)
    if chunk_index < 0 or chunk_index >= max_chunks:
        raise UploadRejectedError("Chunk index is outside the declared upload size")


async def write_request_chunk(
    request: Request,
    chunk_path: Path,
    max_chunk_size: int,
) -> int:
    """Stream one request body to disk while enforcing a chunk size limit."""
    total_size = 0
    try:
        async with aiofiles.open(chunk_path, "wb") as f:
            async for chunk in request.stream():
                if not chunk:
                    continue
                total_size += len(chunk)
                if total_size > max_chunk_size:
                    raise UploadRejectedError(
                        f"Chunk exceeds the maximum allowed size of "
                        f"{_format_bytes(max_chunk_size)}",
                        status_code=413,
                    )
                await f.write(chunk)
    except Exception:
        if chunk_path.exists():
            chunk_path.unlink()
        raise

    if total_size <= 0:
        if chunk_path.exists():
            chunk_path.unlink()
        raise UploadRejectedError("Uploaded chunk is empty")

    return total_size


async def write_request_chunk_at_offset(
    request: Request,
    staging_path: Path,
    max_chunk_size: int,
    offset: int,
) -> int:
    """Write a retryable chunk directly into a single staging file."""
    total_size = 0
    mode = "r+b" if staging_path.exists() else "w+b"
    async with aiofiles.open(staging_path, mode) as file:
        await file.seek(offset)
        async for chunk in request.stream():
            if not chunk:
                continue
            total_size += len(chunk)
            if total_size > max_chunk_size:
                raise UploadRejectedError(
                    f"Chunk exceeds the maximum allowed size of "
                    f"{_format_bytes(max_chunk_size)}",
                    status_code=413,
                    code="CHUNK_TOO_LARGE",
                )
            await file.write(chunk)
    if total_size <= 0:
        raise UploadRejectedError("Uploaded chunk is empty", code="EMPTY_CHUNK")
    return total_size


def validate_complete_staging_file(
    staging_path: Path,
    metadata: dict[str, Any],
    chunk_size: int,
    max_file_size: int,
) -> Path:
    """Validate the received range map and completed staging file."""
    try:
        file_size = int(metadata["file_size"])
        received = {int(index) for index in metadata.get("chunks_received", [])}
        received_sizes = {
            int(index): int(size)
            for index, size in metadata.get("chunk_sizes", {}).items()
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise UploadRejectedError("Upload session metadata is invalid") from exc

    validate_file_size_limit(file_size, max_file_size, metadata.get("filename"))
    expected_count = expected_chunk_count(file_size, chunk_size)
    expected_indexes = set(range(expected_count))
    if received != expected_indexes:
        missing_count = len(expected_indexes - received)
        raise UploadRejectedError(
            f"Upload is incomplete. Missing {missing_count} chunk(s)",
            code="UPLOAD_INCOMPLETE",
        )

    for index in expected_indexes:
        expected_size = min(chunk_size, file_size - index * chunk_size)
        if received_sizes.get(index) != expected_size:
            raise UploadRejectedError(
                f"Chunk {index} has an unexpected size",
                code="INVALID_CHUNK_SIZE",
            )

    try:
        staged_size = staging_path.stat().st_size
    except FileNotFoundError as exc:
        raise UploadRejectedError(
            "Upload staging file is missing", code="UPLOAD_INCOMPLETE"
        ) from exc
    if staged_size != file_size:
        raise UploadRejectedError(
            "Completed upload size does not match the declared file size",
            code="UPLOAD_SIZE_MISMATCH",
        )
    return staging_path


def validate_complete_chunk_set(
    upload_dir: Path,
    metadata: dict[str, Any],
    chunk_size: int,
    max_file_size: int,
) -> list[Path]:
    """Return chunk paths only when they exactly match declared upload metadata."""
    try:
        file_size = int(metadata["file_size"])
        received = {int(index) for index in metadata.get("chunks_received", [])}
    except (KeyError, TypeError, ValueError) as exc:
        raise UploadRejectedError("Upload session metadata is invalid") from exc

    validate_file_size_limit(file_size, max_file_size)

    expected_count = expected_chunk_count(file_size, chunk_size)
    expected_indexes = set(range(expected_count))
    if received != expected_indexes:
        missing_count = len(expected_indexes - received)
        raise UploadRejectedError(
            f"Upload is incomplete. Missing {missing_count} chunk(s)"
        )

    expected_paths = [
        upload_dir / f"chunk_{index:06d}" for index in range(expected_count)
    ]
    expected_names = {path.name for path in expected_paths}
    actual_names = {path.name for path in upload_dir.glob("chunk_*") if path.is_file()}
    if actual_names != expected_names:
        raise UploadRejectedError("Upload session contains unexpected chunks")

    total_size = 0
    for index, chunk_path in enumerate(expected_paths):
        try:
            size = chunk_path.stat().st_size
        except FileNotFoundError as exc:
            raise UploadRejectedError("Upload is incomplete") from exc

        expected_size = (
            chunk_size
            if index < expected_count - 1
            else file_size - chunk_size * (expected_count - 1)
        )
        if size != expected_size:
            raise UploadRejectedError("Chunk sizes do not match declared file size")
        total_size += size

    if total_size != file_size:
        raise UploadRejectedError("Assembled upload size does not match declaration")

    return expected_paths
