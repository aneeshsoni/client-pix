"""Tests for selecting video poster thumbnails."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.db.album_db_models import Album
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from services.storage_service import storage_service


async def _create_media(
    db_session: AsyncSession,
    *,
    is_video: bool,
) -> tuple[Album, Photo]:
    album = Album(title="Videos", slug="videos")
    file_hash = FileHash(
        sha256_hash="b" * 64,
        storage_path="videos/" + "b" * 64 + ".mp4",
        file_extension=".mp4",
        mime_type="video/mp4" if is_video else "image/jpeg",
        file_size=1024,
        width=1920,
        height=1080,
        reference_count=1,
    )
    photo = Photo(
        album=album,
        file_hash=file_hash,
        original_filename="highlight.mp4",
        is_video=is_video,
    )
    db_session.add_all([album, file_hash, photo])
    await db_session.commit()
    return album, photo


@pytest.mark.asyncio
async def test_admin_can_select_video_thumbnail_frame(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
):
    album, photo = await _create_media(db_session, is_video=True)
    captured: dict[str, object] = {}

    async def fake_set_video_thumbnail(
        file_id: str,
        extension: str,
        timestamp_seconds: float,
    ) -> bool:
        captured.update(
            file_id=file_id,
            extension=extension,
            timestamp_seconds=timestamp_seconds,
        )
        return True

    monkeypatch.setattr(
        storage_service,
        "set_video_thumbnail",
        fake_set_video_thumbnail,
    )

    response = await client.put(
        f"/api/albums/{album.id}/photos/{photo.id}/video-thumbnail",
        headers=auth_headers,
        json={"timestamp_seconds": 12.5},
    )

    assert response.status_code == 200
    assert response.json()["updated_at"]
    assert captured == {
        "file_id": "b" * 64,
        "extension": ".mp4",
        "timestamp_seconds": 12.5,
    }


@pytest.mark.asyncio
async def test_thumbnail_selection_rejects_images(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    album, photo = await _create_media(db_session, is_video=False)

    response = await client.put(
        f"/api/albums/{album.id}/photos/{photo.id}/video-thumbnail",
        headers=auth_headers,
        json={"timestamp_seconds": 2},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Thumbnails can only be selected for videos"


@pytest.mark.asyncio
async def test_thumbnail_selection_rejects_negative_timestamp(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    album, photo = await _create_media(db_session, is_video=True)

    response = await client.put(
        f"/api/albums/{album.id}/photos/{photo.id}/video-thumbnail",
        headers=auth_headers,
        json={"timestamp_seconds": -1},
    )

    assert response.status_code == 422
