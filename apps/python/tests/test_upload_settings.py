"""Tests for administrator-configurable upload limits."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.db.album_db_models import Album


@pytest.mark.asyncio
async def test_admin_can_update_upload_limits(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    response = await client.patch(
        "/api/system/settings/upload-limits",
        headers=auth_headers,
        json={
            "max_upload_file_bytes": 10 * 1024**3,
            "max_shared_upload_file_bytes": 2 * 1024**3,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["admin_upload"]["max_file_bytes"] == 10 * 1024**3
    assert body["shared_upload"]["max_file_bytes"] == 2 * 1024**3


@pytest.mark.asyncio
async def test_share_limit_cannot_exceed_admin_limit(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    response = await client.patch(
        "/api/system/settings/upload-limits",
        headers=auth_headers,
        json={
            "max_upload_file_bytes": 1024**3,
            "max_shared_upload_file_bytes": 2 * 1024**3,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "INVALID_UPLOAD_LIMIT"


@pytest.mark.asyncio
async def test_album_capabilities_and_init_use_saved_limit(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    album = Album(
        id=uuid.uuid4(),
        title="Large uploads",
        slug="large-uploads",
    )
    db_session.add(album)
    await db_session.commit()

    limit = 6 * 1024**3
    update_response = await client.patch(
        "/api/system/settings/upload-limits",
        headers=auth_headers,
        json={
            "max_upload_file_bytes": limit,
            "max_shared_upload_file_bytes": 1024**3,
        },
    )
    assert update_response.status_code == 200

    capabilities = await client.get(
        f"/api/albums/{album.id}/upload-capabilities",
        headers=auth_headers,
    )
    assert capabilities.status_code == 200
    assert capabilities.json()["max_file_bytes"] == limit

    rejected = await client.post(
        f"/api/albums/{album.id}/upload/init",
        headers=auth_headers,
        params={
            "filename": "too-large.mp4",
            "file_size": limit + 1,
        },
    )
    assert rejected.status_code == 413
    assert "6.0 GB" in rejected.json()["detail"]
    assert rejected.json()["error"]["code"] == "FILE_TOO_LARGE"

    initialized = await client.post(
        f"/api/albums/{album.id}/upload/init",
        headers=auth_headers,
        params={"filename": "resume.mp4", "file_size": 4},
    )
    assert initialized.status_code == 200
    upload_id = initialized.json()["upload_id"]
    chunk = await client.post(
        f"/api/albums/{album.id}/upload/{upload_id}/chunk",
        headers={**auth_headers, "Content-Type": "application/octet-stream"},
        params={"chunk_index": 0},
        content=b"data",
    )
    assert chunk.status_code == 200

    status = await client.get(
        f"/api/albums/{album.id}/upload/{upload_id}",
        headers=auth_headers,
    )
    assert status.status_code == 200
    assert status.json()["chunks_received"] == [0]

    completed = await client.post(
        f"/api/albums/{album.id}/upload/{upload_id}/complete",
        headers=auth_headers,
    )
    assert completed.status_code == 415
