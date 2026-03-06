"""Background download service with in-memory job tracking and disk caching."""

import hashlib
import os
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

from core.config import DOWNLOAD_CACHE_TTL_HOURS, UPLOAD_DIR


@dataclass
class DownloadJob:
    job_id: str
    album_id: str
    status: str = "queued"  # queued | processing | ready | failed
    progress: int = 0
    total_files: int = 0
    processed_files: int = 0
    zip_path: str | None = None
    zip_size: int = 0
    created_at: float = field(default_factory=time.time)
    error: str | None = None
    album_title: str = ""
    # Internal: file data for building the ZIP
    _files_to_zip: list[tuple[str, str]] = field(default_factory=list)


class DownloadService:
    """Manages background ZIP creation with caching."""

    def __init__(self):
        self._jobs: dict[str, DownloadJob] = {}
        self._executor = ThreadPoolExecutor(max_workers=4)
        self._cache_dir = UPLOAD_DIR / "cache" / "zips"

    def ensure_cache_dir(self):
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_key(self, album_id: str, photo_ids: list[str] | None = None) -> str:
        if photo_ids is None:
            return f"{album_id}"
        sorted_ids = sorted(photo_ids)
        hash_str = hashlib.md5(",".join(sorted_ids).encode()).hexdigest()[:12]
        return f"{album_id}_{hash_str}"

    def _cache_path(self, cache_key: str) -> Path:
        return self._cache_dir / f"{cache_key}.zip"

    def get_cached_zip(
        self, album_id: str, photo_ids: list[str] | None = None
    ) -> Path | None:
        cache_key = self._cache_key(album_id, photo_ids)
        path = self._cache_path(cache_key)
        if path.exists():
            # Check if older than 24 hours
            if time.time() - os.path.getmtime(path) > DOWNLOAD_CACHE_TTL_HOURS * 3600:
                try:
                    os.unlink(path)
                except OSError:
                    pass
                return None
            return path
        return None

    def prepare_download(
        self,
        album_id: str,
        album_title: str,
        photos: Sequence,
        upload_dir: Path,
        photo_ids: list[str] | None = None,
    ) -> DownloadJob:
        """Start a background download job or return cached result."""
        self.ensure_cache_dir()

        # Collect files to zip
        files_to_zip: list[tuple[str, str]] = []
        used_names: dict[str, int] = {}

        for photo in photos:
            file_hash = photo.file_hash
            if not file_hash:
                continue

            file_path = upload_dir / file_hash.storage_path
            if not file_path.exists():
                continue

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

            files_to_zip.append((str(file_path), archive_name))

        if not files_to_zip:
            job = DownloadJob(
                job_id=uuid.uuid4().hex,
                album_id=album_id,
                status="failed",
                error="No files available for download",
                album_title=album_title,
            )
            self._jobs[job.job_id] = job
            return job

        # Check cache
        actual_photo_ids = photo_ids if photo_ids else None
        cached = self.get_cached_zip(album_id, actual_photo_ids)
        if cached:
            job = DownloadJob(
                job_id=uuid.uuid4().hex,
                album_id=album_id,
                status="ready",
                progress=100,
                total_files=len(files_to_zip),
                processed_files=len(files_to_zip),
                zip_path=str(cached),
                zip_size=os.path.getsize(cached),
                album_title=album_title,
            )
            self._jobs[job.job_id] = job
            return job

        # Create new job and start background build
        cache_key = self._cache_key(album_id, actual_photo_ids)
        job = DownloadJob(
            job_id=uuid.uuid4().hex,
            album_id=album_id,
            status="queued",
            total_files=len(files_to_zip),
            album_title=album_title,
            _files_to_zip=files_to_zip,
        )
        job.zip_path = str(self._cache_path(cache_key))
        self._jobs[job.job_id] = job

        self._executor.submit(self._build_zip, job.job_id)
        return job

    def _build_zip(self, job_id: str) -> None:
        """Build ZIP file in a background thread."""
        job = self._jobs.get(job_id)
        if not job:
            return

        job.status = "processing"
        zip_path = job.zip_path
        temp_path = f"{zip_path}.tmp"

        try:
            with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_STORED) as zf:
                for i, (file_path, archive_name) in enumerate(job._files_to_zip):
                    zf.write(file_path, archive_name)
                    job.processed_files = i + 1
                    job.progress = int((i + 1) / job.total_files * 100)

            # Atomically move temp to final path
            os.rename(temp_path, zip_path)
            job.zip_size = os.path.getsize(zip_path)
            job.status = "ready"
            job.progress = 100
        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            # Clean up partial file
            for path in [temp_path, zip_path]:
                try:
                    os.unlink(path)
                except OSError:
                    pass
        finally:
            # Clear internal file list to free memory
            job._files_to_zip = []

    def get_job(self, job_id: str) -> DownloadJob | None:
        return self._jobs.get(job_id)

    def invalidate_cache(self, album_id: str) -> None:
        """Delete all cached ZIPs for an album."""
        if not self._cache_dir.exists():
            return
        prefix = str(album_id)
        for path in self._cache_dir.iterdir():
            if path.stem.startswith(prefix):
                try:
                    os.unlink(path)
                except OSError:
                    pass

    def cleanup_expired(self) -> int:
        """Remove expired cache files and stale jobs. Returns count of cleaned items."""
        cleaned = 0
        now = time.time()

        # Clean expired ZIP files (older than 24 hours)
        if self._cache_dir.exists():
            for path in self._cache_dir.iterdir():
                if path.suffix in (".zip", ".tmp"):
                    try:
                        if (
                            now - os.path.getmtime(path)
                            > DOWNLOAD_CACHE_TTL_HOURS * 3600
                        ):
                            os.unlink(path)
                            cleaned += 1
                    except OSError:
                        pass

        # Prune completed/failed jobs older than 1 hour
        stale_ids = [
            jid
            for jid, job in self._jobs.items()
            if job.status in ("ready", "failed") and now - job.created_at > 3600
        ]
        for jid in stale_ids:
            del self._jobs[jid]
            cleaned += 1

        return cleaned


# Singleton instance
download_service = DownloadService()
