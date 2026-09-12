"""Tests for album collections and collection-level access."""

from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from models.db.album_db_models import Album
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from services.storage_service import storage_service
from services.download_service import download_service


async def _albums(db_session: AsyncSession) -> tuple[Album, Album, Album]:
    albums = (
        Album(title="Wedding", slug="wedding"),
        Album(title="Reception", slug="reception"),
        Album(title="Portraits", slug="portraits"),
    )
    db_session.add_all(albums)
    await db_session.commit()
    return albums


@pytest.mark.asyncio
async def test_collection_downloads_are_password_protected_and_album_scoped(
    client, db_session, auth_headers, tmp_path, monkeypatch
):
    from api.files import files_api

    wedding, reception, outside = await _albums(db_session)
    monkeypatch.setattr(files_api, "UPLOAD_DIR", tmp_path)
    photos = []
    for index, album in enumerate((wedding, reception, outside)):
        digest = f"{index + 1:064x}"
        path = tmp_path / "originals" / digest[:2] / digest[2:4] / f"{digest}.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"original-photo")
        photo = Photo(
            album_id=album.id,
            original_filename=f"original-{index}.jpg",
            file_hash=FileHash(
                sha256_hash=digest,
                storage_path=str(path.relative_to(tmp_path)),
                file_extension=".jpg",
                mime_type="image/jpeg",
                file_size=14,
                width=100,
                height=100,
            ),
        )
        db_session.add(photo)
        photos.append(photo)
    await db_session.commit()
    created = await client.post(
        "/api/collections",
        headers=auth_headers,
        json={
            "title": "Private",
            "access_level": "private",
            "password": "secret123",
            "album_ids": [str(wedding.id), str(reception.id)],
        },
    )
    token = created.json()["token"]
    base = f"/api/collection-share/{token}/albums/{wedding.id}"
    zip_path = tmp_path / "album.zip"
    zip_path.write_bytes(b"zip-content")
    job = SimpleNamespace(
        job_id="job-1",
        album_id=str(wedding.id),
        album_title=wedding.title,
        status="ready",
        progress=100,
        total_files=1,
        processed_files=1,
        zip_size=11,
        error=None,
        zip_path=zip_path,
    )
    prepare = Mock(return_value=job)
    monkeypatch.setattr(download_service, "prepare_download", prepare)
    monkeypatch.setattr(download_service, "get_job", lambda _: job)
    assert (await client.post(f"{base}/prepare-download", json={})).status_code == 401
    response = await client.post(
        f"{base}/prepare-download", json={"password": "secret123"}
    )
    assert response.status_code == 200
    assert [p.id for p in prepare.call_args.kwargs["photos"]] == [photos[0].id]
    assert prepare.call_args.kwargs["album_id"] == str(wedding.id)
    for endpoint in ("download-status", "download-file"):
        url = f"{base}/{endpoint}/job-1"
        assert (await client.get(url)).status_code == 401
        assert (
            await client.get(url, params={"password": "secret123"})
        ).status_code == 200
        wrong_album = url.replace(str(wedding.id), str(reception.id))
        assert (
            await client.get(wrong_album, params={"password": "secret123"})
        ).status_code == 404
    outside_url = base.replace(str(wedding.id), str(outside.id))
    assert (
        await client.post(
            f"{outside_url}/prepare-download", json={"password": "secret123"}
        )
    ).status_code == 404
    assert (
        await client.post(
            f"/api/collection-share/{token}/prepare-download",
            json={"password": "secret123"},
        )
    ).status_code == 404

    photo_url = f"/api/files/collection/{token}/album/{wedding.id}/photo/{photos[0].id}"
    assert (await client.get(photo_url, params={"download": "true"})).status_code == 401
    original = await client.get(
        photo_url, params={"download": "true", "password": "secret123"}
    )
    assert original.content == b"original-photo"
    assert 'filename="original-0.jpg"' in original.headers["content-disposition"]
    wrong_photo = photo_url.replace(str(photos[0].id), str(photos[1].id))
    assert (
        await client.get(
            wrong_photo, params={"password": "secret123", "download": "true"}
        )
    ).status_code == 404

    await client.patch(
        f"/api/collections/{created.json()['id']}",
        headers=auth_headers,
        json={"album_ids": [str(reception.id)]},
    )
    assert (
        await client.get(
            f"{base}/download-file/job-1", params={"password": "secret123"}
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_public_collection_groups_albums_under_one_link(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    wedding, reception, portraits = await _albums(db_session)
    created = await client.post(
        "/api/collections",
        headers=auth_headers,
        json={
            "title": "Smith Wedding",
            "description": "All wedding galleries",
            "access_level": "public",
            "album_ids": [str(wedding.id), str(reception.id)],
        },
    )

    assert created.status_code == 201
    collection = created.json()
    assert collection["album_count"] == 2
    assert [album["id"] for album in collection["albums"]] == [
        str(wedding.id),
        str(reception.id),
    ]
    assert f"/collection/{collection['token']}" in collection["share_url"]

    accessed = await client.post(
        f"/api/collection-share/{collection['token']}/access",
        json={"password": None},
    )
    assert accessed.status_code == 200
    assert [album["title"] for album in accessed.json()["albums"]] == [
        "Wedding",
        "Reception",
    ]

    album_access = await client.post(
        f"/api/collection-share/{collection['token']}/albums/{wedding.id}/access",
        json={"password": None},
    )
    assert album_access.status_code == 200
    assert album_access.json()["title"] == "Wedding"

    outside_album = await client.post(
        f"/api/collection-share/{collection['token']}/albums/{portraits.id}/access",
        json={"password": None},
    )
    assert outside_album.status_code == 404


@pytest.mark.asyncio
async def test_private_collection_password_applies_to_every_album(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    wedding, reception, _ = await _albums(db_session)
    created = await client.post(
        "/api/collections",
        headers=auth_headers,
        json={
            "title": "Private galleries",
            "access_level": "private",
            "password": "collection-secret",
            "album_ids": [str(wedding.id), str(reception.id)],
        },
    )
    assert created.status_code == 201
    collection = created.json()
    token = collection["token"]

    for payload, expected_status in [
        ({"password": None}, 401),
        ({"password": "wrong-password"}, 401),
        ({"password": "collection-secret"}, 200),
    ]:
        response = await client.post(
            f"/api/collection-share/{token}/access", json=payload
        )
        assert response.status_code == expected_status

    album_without_password = await client.post(
        f"/api/collection-share/{token}/albums/{wedding.id}/access",
        json={"password": None},
    )
    assert album_without_password.status_code == 401
    album_with_password = await client.post(
        f"/api/collection-share/{token}/albums/{wedding.id}/access",
        json={"password": "collection-secret"},
    )
    assert album_with_password.status_code == 200


@pytest.mark.asyncio
async def test_album_can_belong_to_multiple_collections_and_membership_can_change(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    wedding, reception, _ = await _albums(db_session)
    collection_ids = []
    for title in ("Client favorites", "Complete event"):
        response = await client.post(
            "/api/collections",
            headers=auth_headers,
            json={
                "title": title,
                "access_level": "public",
                "album_ids": [str(wedding.id)],
            },
        )
        assert response.status_code == 201
        collection_ids.append(response.json()["id"])

    updated = await client.patch(
        f"/api/collections/{collection_ids[0]}",
        headers=auth_headers,
        json={"album_ids": [str(reception.id), str(wedding.id)]},
    )
    assert updated.status_code == 200
    assert [album["id"] for album in updated.json()["albums"]] == [
        str(reception.id),
        str(wedding.id),
    ]

    other = await client.get(
        f"/api/collections/{collection_ids[1]}",
        headers=auth_headers,
    )
    assert other.status_code == 200
    assert [album["id"] for album in other.json()["albums"]] == [str(wedding.id)]


@pytest.mark.asyncio
async def test_collection_custom_slug_is_editable_unique_and_publicly_resolved(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
):
    wedding, _, _ = await _albums(db_session)
    created = await client.post(
        "/api/collections",
        headers=auth_headers,
        json={
            "title": "Smith Wedding",
            "access_level": "public",
            "custom_slug": "smith-wedding",
            "album_ids": [str(wedding.id)],
        },
    )

    assert created.status_code == 201
    collection = created.json()
    assert collection["custom_slug"] == "smith-wedding"
    assert collection["share_url"].endswith("/collection/smith-wedding")

    info = await client.get("/api/collection-share/smith-wedding/info")
    assert info.status_code == 200
    assert info.json()["title"] == "Smith Wedding"

    accessed = await client.post(
        f"/api/collection-share/smith-wedding/albums/{wedding.id}/access",
        json={"password": None},
    )
    assert accessed.status_code == 200

    duplicate = await client.post(
        "/api/collections",
        headers=auth_headers,
        json={
            "title": "Duplicate",
            "access_level": "public",
            "custom_slug": "smith-wedding",
        },
    )
    assert duplicate.status_code == 400

    cleared = await client.patch(
        f"/api/collections/{collection['id']}",
        headers=auth_headers,
        json={"custom_slug": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["custom_slug"] is None
    assert cleared.json()["share_url"].endswith(f"/collection/{collection['token']}")


@pytest.mark.asyncio
async def test_collection_open_graph_image_is_a_shareable_grid(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    wedding, reception, _ = await _albums(db_session)
    monkeypatch.setattr(storage_service, "upload_dir", tmp_path)
    for index, (album, color) in enumerate(
        ((wedding, "#ef4444"), (reception, "#3b82f6"))
    ):
        file_hash_value = f"{index + 1:064x}"
        file_hash = FileHash(
            sha256_hash=file_hash_value,
            storage_path=f"originals/{file_hash_value}.jpg",
            file_extension=".jpg",
            mime_type="image/jpeg",
            file_size=100,
            width=400,
            height=300,
        )
        photo = Photo(
            album_id=album.id,
            file_hash=file_hash,
            original_filename=f"cover-{index}.jpg",
        )
        db_session.add(photo)
        await db_session.flush()
        album.cover_photo_id = photo.id
        thumbnail_path = (
            tmp_path
            / "thumbnails"
            / file_hash_value[:2]
            / file_hash_value[2:4]
            / f"{file_hash_value}.webp"
        )
        thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (400, 300), color).save(thumbnail_path, "WEBP")
    await db_session.commit()

    created = await client.post(
        "/api/collections",
        headers=auth_headers,
        json={
            "title": "Wedding Weekend",
            "access_level": "private",
            "password": "collection-secret",
            "custom_slug": "wedding-weekend",
            "album_ids": [str(wedding.id), str(reception.id)],
        },
    )
    assert created.status_code == 201

    image = await client.get("/api/collection-share/wedding-weekend/og-image")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.content.startswith(b"\xff\xd8\xff")
    with Image.open(BytesIO(image.content)) as preview:
        assert preview.size == (1200, 630)
        left = preview.getpixel((300, 315))
        right = preview.getpixel((900, 315))
        assert left[0] > left[2]
        assert right[2] > right[0]
