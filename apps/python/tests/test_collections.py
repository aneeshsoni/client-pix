"""Tests for album collections and collection-level access."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.db.album_db_models import Album


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
