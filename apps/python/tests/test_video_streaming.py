"""Tests for optional adaptive video playback."""

from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.db.album_db_models import Album
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from models.db.video_streaming_db_models import VideoRendition, VideoTranscodeJob
from services.video_streaming_service import video_streaming_worker


async def _create_video(
    db_session: AsyncSession,
    *,
    digest: str,
    width: int,
    height: int,
) -> tuple[Photo, FileHash]:
    album = Album(title=f"Album {digest[0]}", slug=f"album-{digest[0]}")
    file_hash = FileHash(
        sha256_hash=digest,
        storage_path=f"videos/{digest}.mp4",
        file_extension=".mp4",
        mime_type="video/mp4",
        file_size=300 * 1024**2,
        width=width,
        height=height,
        duration_seconds=60,
        reference_count=1,
    )
    photo = Photo(
        album=album,
        file_hash=file_hash,
        original_filename="clip.mp4",
        is_video=True,
    )
    db_session.add_all([album, file_hash, photo])
    await db_session.commit()
    return photo, file_hash


@pytest.mark.asyncio
async def test_video_streaming_is_opt_in_and_backfill_skips_small_videos(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    _eligible_photo, eligible_file = await _create_video(
        db_session,
        digest="a" * 64,
        width=3840,
        height=2160,
    )
    await _create_video(
        db_session,
        digest="b" * 64,
        width=854,
        height=480,
    )

    settings = await client.get(
        "/api/system/settings/video-playback", headers=auth_headers
    )
    assert settings.status_code == 200
    assert settings.json()["enabled"] is False
    assert settings.json()["eligible_existing_videos"] == 1

    enabled = await client.patch(
        "/api/system/settings/video-playback",
        headers=auth_headers,
        json={"enabled": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["enabled"] is True

    backfill = await client.post("/api/videos/backfill", headers=auth_headers)
    assert backfill.status_code == 200
    assert backfill.json()["queued_count"] == 1
    assert backfill.json()["skipped_count"] == 1

    result = await db_session.execute(select(VideoTranscodeJob))
    jobs = list(result.scalars().all())
    assert len(jobs) == 1
    assert jobs[0].file_hash_id == eligible_file.id
    job_id = jobs[0].id

    disabled = await client.patch(
        "/api/system/settings/video-playback",
        headers=auth_headers,
        json={"enabled": False},
    )
    assert disabled.status_code == 200
    db_session.expire_all()
    job = await db_session.get(VideoTranscodeJob, job_id)
    assert job is not None
    assert job.status == "cancelled"


@pytest.mark.asyncio
async def test_ready_video_exposes_labeled_authorized_hls_streams(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    from api.videos import video_streaming_api
    from services import video_streaming_service

    monkeypatch.setattr(video_streaming_api, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(video_streaming_service, "UPLOAD_DIR", tmp_path)

    photo, file_hash = await _create_video(
        db_session,
        digest="c" * 64,
        width=3840,
        height=2160,
    )
    job = VideoTranscodeJob(
        file_hash_id=file_hash.id,
        status="ready",
        progress=100,
    )
    rendition = VideoRendition(
        file_hash_id=file_hash.id,
        quality_label="1080p",
        width=1920,
        height=1080,
        video_bitrate=5_000_000,
        audio_bitrate=128_000,
        playlist_path="unused-in-response",
        file_size=1024,
        duration_seconds=60,
    )
    db_session.add_all([job, rendition])
    stream_root = (
        tmp_path
        / "video_streams"
        / file_hash.sha256_hash[:2]
        / file_hash.sha256_hash[2:4]
        / file_hash.sha256_hash
    )
    quality_root = stream_root / "1080p"
    quality_root.mkdir(parents=True)
    (stream_root / "master.m3u8").write_text(
        "#EXTM3U\n1080p/index.m3u8\n", encoding="utf-8"
    )
    (quality_root / "index.m3u8").write_text(
        "#EXTM3U\n#EXT-X-ENDLIST\n", encoding="utf-8"
    )
    await db_session.commit()

    await client.patch(
        "/api/system/settings/video-playback",
        headers=auth_headers,
        json={"enabled": True},
    )
    unauthorized = await client.post(f"/api/videos/{photo.id}/playback")
    assert unauthorized.status_code == 401

    playback = await client.post(
        f"/api/videos/{photo.id}/playback", headers=auth_headers
    )
    assert playback.status_code == 200
    body = playback.json()
    assert body["status"] == "ready"
    assert body["source"]["label"] == "2160p 4K"
    assert [quality["label"] for quality in body["qualities"]] == [
        "2160p 4K",
        "1080p HD",
    ]
    assert "Original" not in str(body)

    master = await client.get(body["manifest_url"])
    assert master.status_code == 200
    assert "1080p/index.m3u8" in master.text
    tampered = await client.get(
        body["manifest_url"].replace("/master.m3u8", "x/master.m3u8")
    )
    assert tampered.status_code == 401
    quality = await client.get(body["qualities"][1]["playlist_url"])
    assert quality.status_code == 200


@pytest.mark.asyncio
async def test_cancellation_check_does_not_expire_loaded_video_metadata(
    db_session: AsyncSession,
):
    _photo, file_hash = await _create_video(
        db_session,
        digest="d" * 64,
        width=3840,
        height=2160,
    )
    job = VideoTranscodeJob(
        file_hash_id=file_hash.id,
        status="processing",
        progress=1,
    )
    db_session.add(job)
    await db_session.commit()

    assert await video_streaming_worker._is_cancelled(db_session, job.id) is False
    assert file_hash.width == 3840
    assert file_hash.height == 2160
