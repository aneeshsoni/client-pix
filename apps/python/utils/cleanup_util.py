"""Utilities for cleaning up temporary files."""

import asyncio
import glob
import os
import shutil
import time
from pathlib import Path

# Background task handle for cleanup
_cleanup_task: asyncio.Task | None = None


def cleanup_old_temp_files(upload_dir: Path) -> tuple[int, int]:
    """
    Remove temporary files past their age threshold.

    Cleans:
    - ZIP files in /tmp from album downloads (1 hour)
    - temp_* files in upload directory from interrupted uploads (1 hour)
    - Abandoned chunked upload directories in uploads/chunks/ (24 hours)

    Returns:
        Tuple of (files_cleaned, bytes_cleaned)
    """
    cleaned_count = 0
    cleaned_size = 0
    one_hour_ago = time.time() - 3600  # 1 hour
    one_day_ago = time.time() - 86400  # 24 hours

    # Clean ZIP files in /tmp
    for pattern in ["/tmp/*.zip", "/tmp/tmp*.zip"]:
        for filepath in glob.glob(pattern):
            try:
                if os.path.getmtime(filepath) < one_hour_ago:
                    size = os.path.getsize(filepath)
                    os.unlink(filepath)
                    cleaned_count += 1
                    cleaned_size += size
            except (OSError, FileNotFoundError):
                pass

    # Clean temp upload files (temp_* in upload root)
    temp_pattern = str(upload_dir / "temp_*")
    for filepath in glob.glob(temp_pattern):
        try:
            if os.path.getmtime(filepath) < one_hour_ago:
                size = os.path.getsize(filepath)
                os.unlink(filepath)
                cleaned_count += 1
                cleaned_size += size
        except (OSError, FileNotFoundError):
            pass

    # Clean abandoned chunked upload directories (24 hour threshold)
    chunks_dir = upload_dir / "chunks"
    if chunks_dir.exists():
        for upload_session_dir in chunks_dir.iterdir():
            if not upload_session_dir.is_dir():
                continue
            try:
                # Check the directory modification time
                dir_mtime = os.path.getmtime(upload_session_dir)
                if dir_mtime < one_day_ago:
                    # Calculate total size of the directory
                    dir_size = sum(
                        f.stat().st_size
                        for f in upload_session_dir.rglob("*")
                        if f.is_file()
                    )
                    shutil.rmtree(upload_session_dir)
                    cleaned_count += 1
                    cleaned_size += dir_size
            except (OSError, FileNotFoundError):
                pass

    if cleaned_count > 0:
        print(
            f"🧹 Cleaned {cleaned_count} temp files/dirs ({cleaned_size / 1024 / 1024:.1f} MB)"
        )

    return cleaned_count, cleaned_size


async def periodic_cleanup(upload_dir: Path, interval_seconds: int = 1800):
    """
    Run cleanup periodically.

    Args:
        upload_dir: Path to the upload directory
        interval_seconds: Time between cleanups (default: 30 minutes)
    """
    while True:
        await asyncio.sleep(interval_seconds)
        cleanup_old_temp_files(upload_dir)


def start_cleanup_task(upload_dir: Path) -> asyncio.Task:
    """Start the periodic cleanup background task."""
    global _cleanup_task
    _cleanup_task = asyncio.create_task(periodic_cleanup(upload_dir))
    return _cleanup_task


async def stop_cleanup_task():
    """Stop the periodic cleanup background task."""
    global _cleanup_task
    if _cleanup_task:
        _cleanup_task.cancel()
        try:
            await _cleanup_task
        except asyncio.CancelledError:
            pass
        _cleanup_task = None
