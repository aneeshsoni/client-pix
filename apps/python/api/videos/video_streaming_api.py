"""Optional adaptive video playback APIs."""

import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from core.config import UPLOAD_DIR
from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from models.api.video_streaming_api_models import (
    PublicVideoPlaybackRequest,
    VideoBackfillResponse,
    VideoPlaybackResponse,
    VideoProcessingStatusResponse,
    VideoQualityResponse,
    VideoRenditionCleanupResponse,
    VideoStreamingSettingsResponse,
    VideoStreamingSettingsUpdate,
)
from models.db.admin_db_models import Admin
from models.db.collection_db_models import Collection, CollectionAlbum
from models.db.photo_db_models import Photo
from models.db.share_link_db_models import ShareLink
from models.db.video_streaming_db_models import VideoRendition, VideoTranscodeJob
from services.collection_service import validate_collection_password
from services.video_streaming_service import (
    delete_all_renditions,
    get_video_streaming_summary,
    is_video_streaming_enabled,
    queue_existing_videos,
    retry_video_job,
    update_video_streaming_enabled,
)
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from utils.auth_util import get_admin_from_token_or_query
from utils.jwt_util import (
    create_video_playback_token,
    verify_video_playback_token,
)
from utils.security_util import verify_password

router = APIRouter(tags=["video-streaming"])
_STREAM_FILE_PATTERN = re.compile(r"^(?:index\.m3u8|init\.mp4|segment_[0-9]{5}\.m4s)$")


def _settings_response(summary) -> VideoStreamingSettingsResponse:
    return VideoStreamingSettingsResponse(**summary.__dict__)


def _source_label(width: int, height: int) -> str:
    axis = min(width, height)
    if axis >= 4000:
        return "4320p 8K"
    if axis >= 2000:
        return "2160p 4K"
    if axis >= 1400:
        return "1440p HD"
    if axis >= 1080:
        return "1080p HD"
    if axis >= 720:
        return "720p HD"
    return f"{axis}p" if axis > 0 else "Uploaded quality"


def _rendition_label(height: int, width: int) -> str:
    axis = min(width, height)
    return f"{axis}p HD" if axis >= 720 else f"{axis}p"


async def _load_video(photo_id: uuid.UUID, db: AsyncSession) -> Photo:
    result = await db.execute(
        select(Photo)
        .where(Photo.id == photo_id, Photo.is_video.is_(True))
        .options(selectinload(Photo.file_hash))
    )
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return photo


async def _build_playback_response(
    photo: Photo,
    access_kind: str,
    access_id: uuid.UUID,
    db: AsyncSession,
) -> VideoPlaybackResponse:
    file_hash = photo.file_hash
    source = VideoQualityResponse(
        id="source",
        label=_source_label(file_hash.width, file_hash.height),
        width=file_hash.width,
        height=file_hash.height,
        is_source=True,
    )
    if not await is_video_streaming_enabled(db):
        return VideoPlaybackResponse(
            enabled=False,
            status="disabled",
            source=source,
            qualities=[source],
        )

    job_result = await db.execute(
        select(VideoTranscodeJob).where(VideoTranscodeJob.file_hash_id == file_hash.id)
    )
    job = job_result.scalar_one_or_none()
    if job is None:
        return VideoPlaybackResponse(
            enabled=True,
            status="source_only",
            source=source,
            qualities=[source],
        )
    if job.status != "ready":
        return VideoPlaybackResponse(
            enabled=True,
            status=job.status,
            source=source,
            qualities=[source],
            error=job.error_message if job.status == "failed" else None,
            progress=job.progress,
        )

    rendition_result = await db.execute(
        select(VideoRendition)
        .where(VideoRendition.file_hash_id == file_hash.id)
        .order_by(VideoRendition.height.desc(), VideoRendition.width.desc())
    )
    renditions = list(rendition_result.scalars().all())
    stream_root = (
        UPLOAD_DIR
        / "video_streams"
        / file_hash.sha256_hash[:2]
        / file_hash.sha256_hash[2:4]
        / file_hash.sha256_hash
    )
    if not renditions or not (stream_root / "master.m3u8").exists():
        return VideoPlaybackResponse(
            enabled=True,
            status="failed",
            source=source,
            qualities=[source],
            error="Generated video qualities are unavailable",
        )

    playback_token = create_video_playback_token(photo.id, access_kind, access_id)
    base_url = f"/api/videos/stream/{playback_token}"
    qualities = [source]
    qualities.extend(
        VideoQualityResponse(
            id=item.quality_label,
            label=_rendition_label(item.height, item.width),
            width=item.width,
            height=item.height,
            playlist_url=f"{base_url}/{item.quality_label}/index.m3u8",
        )
        for item in renditions
    )
    return VideoPlaybackResponse(
        enabled=True,
        status="ready",
        source=source,
        qualities=qualities,
        manifest_url=f"{base_url}/master.m3u8",
    )


@router.get(
    "/system/settings/video-playback",
    response_model=VideoStreamingSettingsResponse,
)
async def get_video_playback_settings(
    db: AsyncSession = Depends(get_db),
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    return _settings_response(await get_video_streaming_summary(db))


@router.patch(
    "/system/settings/video-playback",
    response_model=VideoStreamingSettingsResponse,
)
async def patch_video_playback_settings(
    values: VideoStreamingSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    try:
        summary = await update_video_streaming_enabled(db, values.enabled)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _settings_response(summary)


@router.post("/videos/backfill", response_model=VideoBackfillResponse)
async def backfill_videos(
    db: AsyncSession = Depends(get_db),
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    try:
        queued, skipped, estimated = await queue_existing_videos(db)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return VideoBackfillResponse(
        queued_count=queued,
        skipped_count=skipped,
        estimated_additional_bytes=estimated,
    )


@router.delete("/videos/renditions", response_model=VideoRenditionCleanupResponse)
async def remove_all_video_renditions(
    db: AsyncSession = Depends(get_db),
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    deleted, reclaimed = await delete_all_renditions(db)
    return VideoRenditionCleanupResponse(
        deleted_renditions=deleted, reclaimed_bytes=reclaimed
    )


@router.post(
    "/videos/{photo_id}/retry",
    response_model=VideoProcessingStatusResponse,
)
async def retry_video_processing(
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: Admin = Depends(get_admin_from_token_or_query),
):
    photo = await _load_video(photo_id, db)
    try:
        queued = await retry_video_job(db, photo.file_hash_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not queued:
        raise HTTPException(status_code=409, detail="Video is already processing")
    return VideoProcessingStatusResponse(
        photo_id=photo.id, status="pending", progress=0
    )


@router.post("/videos/{photo_id}/playback", response_model=VideoPlaybackResponse)
async def get_admin_video_playback(
    photo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: Admin = Depends(get_admin_from_token_or_query),
):
    photo = await _load_video(photo_id, db)
    return await _build_playback_response(photo, "admin", admin.id, db)


@router.post(
    "/videos/share/{identifier}/{photo_id}/playback",
    response_model=VideoPlaybackResponse,
)
async def get_share_video_playback(
    identifier: str,
    photo_id: uuid.UUID,
    values: PublicVideoPlaybackRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ShareLink).where(
            or_(ShareLink.token == identifier, ShareLink.custom_slug == identifier)
        )
    )
    share_link = result.scalar_one_or_none()
    if share_link is None:
        raise HTTPException(status_code=404, detail="Share link not found")
    if share_link.is_revoked:
        raise HTTPException(status_code=410, detail="Share link has been revoked")
    if share_link.expires_at and share_link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Share link has expired")
    if share_link.is_password_protected:
        if not values.password or not share_link.password_hash:
            raise HTTPException(status_code=401, detail="Password required")
        if not verify_password(values.password, share_link.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
    photo = await _load_video(photo_id, db)
    if photo.album_id != share_link.album_id:
        raise HTTPException(status_code=404, detail="Video not found in shared album")
    return await _build_playback_response(photo, "share", share_link.id, db)


@router.post(
    "/videos/collection/{token}/albums/{album_id}/{photo_id}/playback",
    response_model=VideoPlaybackResponse,
)
async def get_collection_video_playback(
    token: str,
    album_id: uuid.UUID,
    photo_id: uuid.UUID,
    values: PublicVideoPlaybackRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Collection).where(Collection.token == token))
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    validate_collection_password(collection, values.password)
    membership = await db.execute(
        select(CollectionAlbum.id).where(
            CollectionAlbum.collection_id == collection.id,
            CollectionAlbum.album_id == album_id,
        )
    )
    if membership.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Album not found in collection")
    photo = await _load_video(photo_id, db)
    if photo.album_id != album_id:
        raise HTTPException(status_code=404, detail="Video not found in album")
    return await _build_playback_response(photo, "collection", collection.id, db)


async def _validated_stream_root(token: str, db: AsyncSession) -> Path:
    claims = verify_video_playback_token(token)
    if claims is None or not await is_video_streaming_enabled(db):
        raise HTTPException(status_code=401, detail="Invalid or expired playback token")
    photo = await _load_video(uuid.UUID(claims["photo_id"]), db)
    access_id = uuid.UUID(claims["access_id"])
    access_kind = claims["access_kind"]
    if access_kind == "admin":
        if await db.get(Admin, access_id) is None:
            raise HTTPException(status_code=401, detail="Admin no longer exists")
    elif access_kind == "share":
        share_link = await db.get(ShareLink, access_id)
        if (
            share_link is None
            or share_link.is_revoked
            or share_link.album_id != photo.album_id
            or (
                share_link.expires_at
                and share_link.expires_at < datetime.now(timezone.utc)
            )
        ):
            raise HTTPException(status_code=401, detail="Share access has expired")
    else:
        membership = await db.execute(
            select(CollectionAlbum.id).where(
                CollectionAlbum.collection_id == access_id,
                CollectionAlbum.album_id == photo.album_id,
            )
        )
        if membership.scalar_one_or_none() is None:
            raise HTTPException(status_code=401, detail="Collection access has expired")
    file_id = photo.file_hash.sha256_hash
    return UPLOAD_DIR / "video_streams" / file_id[:2] / file_id[2:4] / file_id


@router.get("/videos/stream/{token}/master.m3u8")
async def stream_master_playlist(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    root = await _validated_stream_root(token, db)
    path = root / "master.m3u8"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Stream not found")
    return FileResponse(
        path,
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "private, max-age=60"},
    )


@router.get("/videos/stream/{token}/{quality}/{filename}")
async def stream_video_file(
    token: str,
    quality: str,
    filename: str,
    db: AsyncSession = Depends(get_db),
):
    if quality not in {"1080p", "720p"} or not _STREAM_FILE_PATTERN.fullmatch(filename):
        raise HTTPException(status_code=404, detail="Stream file not found")
    root = await _validated_stream_root(token, db)
    path = root / quality / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Stream file not found")
    media_type = {
        ".m3u8": "application/vnd.apple.mpegurl",
        ".mp4": "video/mp4",
        ".m4s": "video/iso.segment",
    }.get(Path(filename).suffix, "application/octet-stream")
    cache_control = (
        "private, max-age=60"
        if filename.endswith(".m3u8")
        else "private, max-age=31536000, immutable"
    )
    return FileResponse(
        path, media_type=media_type, headers={"Cache-Control": cache_control}
    )
