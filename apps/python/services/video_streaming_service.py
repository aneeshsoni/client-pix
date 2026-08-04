"""Optional adaptive video processing and storage management."""

import asyncio
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from core.config import (
    UPLOAD_DIR,
    VIDEO_STREAMING_AVAILABLE,
    VIDEO_TRANSCODE_CONCURRENCY_CAP,
    VIDEO_TRANSCODE_MIN_FREE_BYTES,
    VIDEO_TRANSCODE_TIMEOUT_SECONDS,
)
from core.database import async_session_maker
from models.db.file_hash_db_models import FileHash
from models.db.video_streaming_db_models import (
    VideoRendition,
    VideoStreamingSettings,
    VideoTranscodeJob,
)
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class RenditionSpec:
    label: str
    axis: int
    video_bitrate: int
    max_bitrate: int
    audio_bitrate: int


RENDITION_SPECS = (
    RenditionSpec("1080p", 1080, 5_000_000, 6_000_000, 128_000),
    RenditionSpec("720p", 720, 2_800_000, 3_500_000, 128_000),
)


@dataclass(frozen=True)
class VideoStreamingSummary:
    available: bool
    enabled: bool
    pending_jobs: int
    processing_jobs: int
    ready_videos: int
    failed_jobs: int
    eligible_existing_videos: int
    rendition_bytes: int
    estimated_backfill_bytes: int


def _quality_axis(file_hash: FileHash) -> int:
    return min(file_hash.width or 0, file_hash.height or 0)


def applicable_specs(file_hash: FileHash) -> tuple[RenditionSpec, ...]:
    axis = _quality_axis(file_hash)
    return tuple(spec for spec in RENDITION_SPECS if axis >= spec.axis)


def estimate_rendition_bytes(file_hash: FileHash) -> int:
    specs = applicable_specs(file_hash)
    if not specs:
        return 0
    if file_hash.duration_seconds and file_hash.duration_seconds > 0:
        return round(
            sum(
                file_hash.duration_seconds
                * (spec.video_bitrate + spec.audio_bitrate)
                / 8
                for spec in specs
            )
        )
    # Existing videos uploaded before duration tracking use a conservative
    # estimate until ffprobe fills their duration during processing.
    return round(file_hash.file_size * 0.2)


def _stream_root(file_id: str) -> Path:
    return UPLOAD_DIR / "video_streams" / file_id[:2] / file_id[2:4] / file_id


async def _get_setting(db: AsyncSession) -> VideoStreamingSettings | None:
    result = await db.execute(
        select(VideoStreamingSettings).where(VideoStreamingSettings.id == 1)
    )
    return result.scalar_one_or_none()


async def is_video_streaming_enabled(db: AsyncSession) -> bool:
    if not VIDEO_STREAMING_AVAILABLE:
        return False
    setting = await _get_setting(db)
    return bool(setting and setting.enabled)


async def get_video_streaming_summary(db: AsyncSession) -> VideoStreamingSummary:
    enabled = await is_video_streaming_enabled(db)
    status_result = await db.execute(
        select(VideoTranscodeJob.status, func.count(VideoTranscodeJob.id)).group_by(
            VideoTranscodeJob.status
        )
    )
    status_counts = dict(status_result.all())
    rendition_bytes = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(VideoRendition.file_size), 0))
            )
        ).scalar_one()
    )
    existing_result = await db.execute(
        select(FileHash).where(FileHash.mime_type.like("video/%"))
    )
    videos = list(existing_result.scalars().all())
    jobs_result = await db.execute(select(VideoTranscodeJob))
    jobs = {job.file_hash_id: job for job in jobs_result.scalars().all()}
    eligible = [
        video
        for video in videos
        if applicable_specs(video)
        and (video.id not in jobs or jobs[video.id].status in {"failed", "cancelled"})
    ]
    return VideoStreamingSummary(
        available=VIDEO_STREAMING_AVAILABLE,
        enabled=enabled,
        pending_jobs=status_counts.get("pending", 0),
        processing_jobs=status_counts.get("processing", 0),
        ready_videos=status_counts.get("ready", 0),
        failed_jobs=status_counts.get("failed", 0),
        eligible_existing_videos=len(eligible),
        rendition_bytes=rendition_bytes,
        estimated_backfill_bytes=sum(estimate_rendition_bytes(v) for v in eligible),
    )


async def update_video_streaming_enabled(
    db: AsyncSession, enabled: bool
) -> VideoStreamingSummary:
    if enabled and not VIDEO_STREAMING_AVAILABLE:
        raise ValueError("Adaptive video playback is unavailable on this deployment")
    setting = await _get_setting(db)
    if setting is None:
        setting = VideoStreamingSettings(id=1, enabled=enabled)
        db.add(setting)
    else:
        setting.enabled = enabled

    if not enabled:
        await db.execute(
            update(VideoTranscodeJob)
            .where(VideoTranscodeJob.status == "pending")
            .values(status="cancelled", progress=0, cancel_requested=True)
        )
        await db.execute(
            update(VideoTranscodeJob)
            .where(VideoTranscodeJob.status == "processing")
            .values(cancel_requested=True)
        )
        video_streaming_worker.cancel_active()
    await db.commit()
    return await get_video_streaming_summary(db)


async def queue_video_if_enabled(
    db: AsyncSession, file_hash: FileHash
) -> VideoTranscodeJob | None:
    if not file_hash.mime_type.startswith("video/") or not applicable_specs(file_hash):
        return None
    if not await is_video_streaming_enabled(db):
        return None
    existing = await db.execute(
        select(VideoTranscodeJob).where(VideoTranscodeJob.file_hash_id == file_hash.id)
    )
    if existing.scalar_one_or_none() is not None:
        return None
    job = VideoTranscodeJob(file_hash_id=file_hash.id, status="pending", progress=0)
    db.add(job)
    return job


async def queue_existing_videos(db: AsyncSession) -> tuple[int, int, int]:
    if not await is_video_streaming_enabled(db):
        raise ValueError("Enable optimized video qualities before processing videos")
    videos_result = await db.execute(
        select(FileHash).where(FileHash.mime_type.like("video/%"))
    )
    jobs_result = await db.execute(select(VideoTranscodeJob))
    existing_jobs = {job.file_hash_id: job for job in jobs_result.scalars().all()}
    queued = 0
    skipped = 0
    estimated = 0
    for file_hash in videos_result.scalars().all():
        if not applicable_specs(file_hash):
            skipped += 1
            continue
        existing_job = existing_jobs.get(file_hash.id)
        if existing_job and existing_job.status not in {"failed", "cancelled"}:
            skipped += 1
            continue
        if existing_job:
            existing_job.status = "pending"
            existing_job.progress = 0
            existing_job.cancel_requested = False
            existing_job.error_message = None
            existing_job.completed_at = None
        else:
            db.add(
                VideoTranscodeJob(
                    file_hash_id=file_hash.id, status="pending", progress=0
                )
            )
        queued += 1
        estimated += estimate_rendition_bytes(file_hash)
    await db.commit()
    return queued, skipped, estimated


async def retry_video_job(db: AsyncSession, file_hash_id: uuid.UUID) -> bool:
    if not await is_video_streaming_enabled(db):
        raise ValueError("Enable optimized video qualities before retrying")
    result = await db.execute(
        select(VideoTranscodeJob).where(VideoTranscodeJob.file_hash_id == file_hash_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        db.add(VideoTranscodeJob(file_hash_id=file_hash_id, status="pending"))
    elif job.status in {"failed", "cancelled"}:
        job.status = "pending"
        job.progress = 0
        job.cancel_requested = False
        job.error_message = None
        job.completed_at = None
    else:
        return False
    await db.commit()
    return True


async def delete_all_renditions(db: AsyncSession) -> tuple[int, int]:
    await db.execute(
        update(VideoTranscodeJob)
        .where(VideoTranscodeJob.status == "pending")
        .values(status="cancelled", progress=0, cancel_requested=True)
    )
    await db.execute(
        update(VideoTranscodeJob)
        .where(VideoTranscodeJob.status == "processing")
        .values(cancel_requested=True)
    )
    video_streaming_worker.cancel_active()
    result = await db.execute(select(VideoRendition))
    renditions = list(result.scalars().all())
    reclaimed = sum(item.file_size for item in renditions)
    file_ids_result = await db.execute(
        select(FileHash.sha256_hash)
        .join(VideoRendition, VideoRendition.file_hash_id == FileHash.id)
        .distinct()
    )
    for file_id in file_ids_result.scalars().all():
        shutil.rmtree(_stream_root(file_id), ignore_errors=True)
    await db.execute(delete(VideoRendition))
    await db.execute(
        update(VideoTranscodeJob)
        .where(VideoTranscodeJob.status == "ready")
        .values(status="cancelled", progress=0)
    )
    await db.commit()
    return len(renditions), reclaimed


def delete_video_stream_files(file_id: str) -> None:
    """Delete generated and temporary streams for one video."""
    root = _stream_root(file_id)
    shutil.rmtree(root, ignore_errors=True)
    if root.parent.exists():
        for path in root.parent.glob(f"{root.name}.tmp.*"):
            shutil.rmtree(path, ignore_errors=True)


class VideoStreamingWorker:
    """Small durable queue worker for the existing single-backend deployment."""

    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []
        self._stop_event = asyncio.Event()
        self._active_processes: dict[uuid.UUID, asyncio.subprocess.Process] = {}
        self._cancelled_jobs: set[uuid.UUID] = set()

    async def start(self) -> None:
        if self._tasks or not VIDEO_STREAMING_AVAILABLE:
            return
        # This deployment runs the queue in the backend process. Any job left
        # processing at startup was interrupted before it could finish.
        async with async_session_maker() as db:
            await db.execute(
                update(VideoTranscodeJob)
                .where(VideoTranscodeJob.status == "processing")
                .values(
                    status="pending",
                    progress=0,
                    cancel_requested=False,
                    error_message=None,
                    started_at=None,
                )
            )
            await db.commit()
        self._stop_event.clear()
        self._tasks = [
            asyncio.create_task(self._run_loop())
            for _ in range(VIDEO_TRANSCODE_CONCURRENCY_CAP)
        ]

    async def stop(self) -> None:
        self._stop_event.set()
        self.cancel_active()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()

    def cancel_active(self) -> None:
        for job_id, process in self._active_processes.items():
            self._cancelled_jobs.add(job_id)
            if process.returncode is None:
                process.terminate()

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                job_id = await self._claim_job()
                if job_id is None:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=2)
                    continue
                await self._process_job(job_id)
            except TimeoutError:
                continue
            except asyncio.CancelledError:
                return
            except Exception as exc:
                print(f"Warning: Video worker loop failed: {exc}")
                await asyncio.sleep(2)

    async def _claim_job(self) -> uuid.UUID | None:
        async with async_session_maker() as db:
            if not await is_video_streaming_enabled(db):
                return None
            result = await db.execute(
                select(VideoTranscodeJob)
                .where(VideoTranscodeJob.status == "pending")
                .order_by(VideoTranscodeJob.created_at.asc())
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            job = result.scalar_one_or_none()
            if job is None:
                return None
            job.status = "processing"
            job.progress = 1
            job.attempt_count += 1
            job.cancel_requested = False
            job.error_message = None
            job.started_at = datetime.now(timezone.utc)
            await db.commit()
            return job.id

    async def _process_job(self, job_id: uuid.UUID) -> None:
        temp_root: Path | None = None
        try:
            async with async_session_maker() as db:
                job = await db.get(VideoTranscodeJob, job_id)
                if job is None:
                    return
                if not await is_video_streaming_enabled(db):
                    job.status = "cancelled"
                    job.progress = 0
                    job.cancel_requested = True
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return
                file_hash = await db.get(FileHash, job.file_hash_id)
                if file_hash is None:
                    raise RuntimeError("Source video record no longer exists")
                source_path = UPLOAD_DIR / file_hash.storage_path
                if not source_path.exists():
                    raise RuntimeError("Source video file is missing")
                specs = applicable_specs(file_hash)
                if not specs:
                    job.status = "cancelled"
                    job.completed_at = datetime.now(timezone.utc)
                    await db.commit()
                    return
                required_bytes = (
                    estimate_rendition_bytes(file_hash) + VIDEO_TRANSCODE_MIN_FREE_BYTES
                )
                if shutil.disk_usage(UPLOAD_DIR).free < required_bytes:
                    raise RuntimeError(
                        "Not enough free storage to safely process this video"
                    )

                final_root = _stream_root(file_hash.sha256_hash)
                temp_root = final_root.with_name(
                    f"{final_root.name}.tmp.{uuid.uuid4().hex}"
                )
                temp_root.mkdir(parents=True, exist_ok=False)
                generated: list[tuple[RenditionSpec, int, int, int]] = []
                for index, spec in enumerate(specs):
                    if await self._is_cancelled(db, job_id):
                        raise asyncio.CancelledError
                    width, height = await self._encode_rendition(
                        job_id, source_path, temp_root, file_hash, spec
                    )
                    quality_root = temp_root / spec.label
                    size = sum(
                        path.stat().st_size
                        for path in quality_root.rglob("*")
                        if path.is_file()
                    )
                    generated.append((spec, width, height, size))
                    job.progress = round(((index + 1) / len(specs)) * 90)
                    await db.commit()

                if await self._is_cancelled(db, job_id):
                    raise asyncio.CancelledError
                self._write_master_playlist(temp_root, generated)
                final_root.parent.mkdir(parents=True, exist_ok=True)
                shutil.rmtree(final_root, ignore_errors=True)
                temp_root.replace(final_root)
                temp_root = None

                await db.execute(
                    delete(VideoRendition).where(
                        VideoRendition.file_hash_id == file_hash.id
                    )
                )
                for spec, width, height, size in generated:
                    db.add(
                        VideoRendition(
                            file_hash_id=file_hash.id,
                            quality_label=spec.label,
                            width=width,
                            height=height,
                            video_bitrate=spec.video_bitrate,
                            audio_bitrate=spec.audio_bitrate,
                            playlist_path=(
                                f"video_streams/{file_hash.sha256_hash[:2]}/"
                                f"{file_hash.sha256_hash[2:4]}/"
                                f"{file_hash.sha256_hash}/{spec.label}/index.m3u8"
                            ),
                            file_size=size,
                            duration_seconds=file_hash.duration_seconds,
                        )
                    )
                job.status = "ready"
                job.progress = 100
                job.completed_at = datetime.now(timezone.utc)
                await db.commit()
        except asyncio.CancelledError:
            await self._finish_job(job_id, "cancelled", None)
        except Exception as exc:
            print(f"Warning: Video job {job_id} failed: {exc}")
            await self._finish_job(job_id, "failed", str(exc)[:1000])
        finally:
            if temp_root is not None:
                shutil.rmtree(temp_root, ignore_errors=True)

    async def _is_cancelled(self, db: AsyncSession, job_id: uuid.UUID) -> bool:
        result = await db.execute(
            select(VideoTranscodeJob.cancel_requested).where(
                VideoTranscodeJob.id == job_id
            )
        )
        cancel_requested = result.scalar_one_or_none()
        return cancel_requested is None or cancel_requested

    async def _finish_job(
        self, job_id: uuid.UUID, status: str, error: str | None
    ) -> None:
        async with async_session_maker() as db:
            job = await db.get(VideoTranscodeJob, job_id)
            if job is None:
                return
            interrupted_by_shutdown = (
                status == "cancelled" and self._stop_event.is_set()
            )
            job.status = "pending" if interrupted_by_shutdown else status
            job.error_message = None if interrupted_by_shutdown else error
            job.cancel_requested = False
            job.progress = 0 if status == "cancelled" else job.progress
            job.completed_at = (
                None if interrupted_by_shutdown else datetime.now(timezone.utc)
            )
            await db.commit()

    async def _encode_rendition(
        self,
        job_id: uuid.UUID,
        source_path: Path,
        temp_root: Path,
        file_hash: FileHash,
        spec: RenditionSpec,
    ) -> tuple[int, int]:
        quality_root = temp_root / spec.label
        quality_root.mkdir(parents=True, exist_ok=True)
        video_filter = (
            "fps=fps='min(source_fps,30)',"
            f"scale='if(gte(iw,ih),-2,{spec.axis})':'if(gte(iw,ih),{spec.axis},-2)'"
        )
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            video_filter,
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-pix_fmt",
            "yuv420p",
            "-b:v",
            str(spec.video_bitrate),
            "-maxrate",
            str(spec.max_bitrate),
            "-bufsize",
            str(spec.max_bitrate * 2),
            "-force_key_frames",
            "expr:gte(t,n_forced*6)",
            "-c:a",
            "aac",
            "-b:a",
            str(spec.audio_bitrate),
            "-ac",
            "2",
            "-ar",
            "48000",
            "-f",
            "hls",
            "-hls_time",
            "6",
            "-hls_playlist_type",
            "vod",
            "-hls_segment_type",
            "fmp4",
            "-hls_fmp4_init_filename",
            "init.mp4",
            "-hls_flags",
            "independent_segments",
            "-hls_segment_filename",
            str(quality_root / "segment_%05d.m4s"),
            str(quality_root / "index.m3u8"),
        ]
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        self._active_processes[job_id] = process
        try:
            _stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=VIDEO_TRANSCODE_TIMEOUT_SECONDS
            )
        except TimeoutError as exc:
            process.kill()
            await process.wait()
            raise RuntimeError("Video processing exceeded the time limit") from exc
        finally:
            self._active_processes.pop(job_id, None)
        if process.returncode != 0:
            if job_id in self._cancelled_jobs:
                self._cancelled_jobs.discard(job_id)
                raise asyncio.CancelledError
            message = stderr.decode("utf-8", errors="replace")[-2000:]
            raise RuntimeError(f"FFmpeg failed for {spec.label}: {message}")

        source_width = file_hash.width
        source_height = file_hash.height
        if source_width >= source_height:
            height = spec.axis
            width = round((source_width / source_height) * height / 2) * 2
        else:
            width = spec.axis
            height = round((source_height / source_width) * width / 2) * 2
        return width, height

    def _write_master_playlist(
        self,
        root: Path,
        generated: list[tuple[RenditionSpec, int, int, int]],
    ) -> None:
        lines = ["#EXTM3U", "#EXT-X-VERSION:7", "#EXT-X-INDEPENDENT-SEGMENTS"]
        for spec, width, height, _size in generated:
            bandwidth = spec.max_bitrate + spec.audio_bitrate
            lines.extend(
                [
                    f'#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={width}x{height},CODECS="avc1.640028,mp4a.40.2"',
                    f"{spec.label}/index.m3u8",
                ]
            )
        (root / "master.m3u8").write_text("\n".join(lines) + "\n")


video_streaming_worker = VideoStreamingWorker()
