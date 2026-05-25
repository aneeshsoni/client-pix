"""Tests for public share link access."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.db.album_db_models import Album
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from models.db.photo_tag_db_models import PhotoTag
from models.db.share_link_db_models import ShareLink


@pytest.mark.asyncio
async def test_access_shared_album_with_tagged_photo(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Tagged photos should be returned without async relationship lazy loading."""
    album = Album(
        title="Austin Condo",
        description="Client gallery",
        slug="austin-condo",
    )
    file_hash = FileHash(
        sha256_hash="a" * 64,
        storage_path="originals/aa/aa/" + "a" * 64 + ".jpg",
        file_extension=".jpg",
        mime_type="image/jpeg",
        file_size=1024,
        width=1600,
        height=1200,
        reference_count=1,
    )
    photo = Photo(
        album=album,
        file_hash=file_hash,
        original_filename="kitchen.jpg",
        sort_order=1,
    )
    tag = PhotoTag(
        album=album,
        name="Kitchen",
        color="#2563eb",
        sort_order=1,
    )
    photo.tags.append(tag)
    share_link = ShareLink(
        album=album,
        token="share-token",
        custom_slug="austin-condo-2026",
        is_password_protected=False,
    )

    db_session.add_all([album, file_hash, photo, tag, share_link])
    await db_session.commit()

    response = await client.post(
        "/api/share/austin-condo-2026/access?sort_by=captured",
        json={},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Austin Condo"
    assert data["tags"][0]["name"] == "Kitchen"
    assert data["photos"][0]["tags"][0]["name"] == "Kitchen"
