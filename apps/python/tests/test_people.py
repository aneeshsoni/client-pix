"""Tests for people and face scan APIs."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from models.db.face_db_models import FaceDetection, Person, PersonFace
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo


async def test_backfill_enqueues_existing_images(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session: AsyncSession,
):
    """Backfill queues existing image hashes but skips videos."""
    image_hash = FileHash(
        sha256_hash="a" * 64,
        storage_path="originals/aa/aa/" + "a" * 64 + ".jpg",
        file_extension=".jpg",
        mime_type="image/jpeg",
        file_size=123,
        width=100,
        height=100,
        reference_count=1,
    )
    video_hash = FileHash(
        sha256_hash="b" * 64,
        storage_path="videos/" + "b" * 64 + ".mp4",
        file_extension=".mp4",
        mime_type="video/mp4",
        file_size=456,
        width=1920,
        height=1080,
        reference_count=1,
    )
    db_session.add_all([image_hash, video_hash])
    await db_session.commit()

    response = await client.post(
        "/api/face-scans/backfill",
        json={"force": False},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json()["queued_count"] == 1
    assert response.json()["total_count"] == 1

    status_response = await client.get("/api/face-scans/status", headers=auth_headers)
    assert status_response.status_code == 200
    status = status_response.json()
    assert status["total_images"] == 1
    assert status["queued"] == 1


async def test_people_detail_expands_assigned_faces_to_photos(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session: AsyncSession,
):
    """Person detail returns assigned faces and photos sharing their file hashes."""
    file_hash = FileHash(
        sha256_hash="c" * 64,
        storage_path="originals/cc/cc/" + "c" * 64 + ".jpg",
        file_extension=".jpg",
        mime_type="image/jpeg",
        file_size=789,
        width=1000,
        height=800,
        reference_count=1,
    )
    db_session.add(file_hash)
    await db_session.flush()

    photo = Photo(
        album_id=None,
        file_hash_id=file_hash.id,
        original_filename="portrait.jpg",
        is_video=False,
    )
    person = Person(display_name="Jane", hidden=False)
    db_session.add_all([photo, person])
    await db_session.flush()

    face = FaceDetection(
        file_hash_id=file_hash.id,
        model_version="opencv-yunet-sface-v1",
        bbox_left=0.2,
        bbox_top=0.1,
        bbox_width=0.3,
        bbox_height=0.4,
        confidence=0.95,
        quality=0.114,
        landmarks=None,
        embedding=None,
    )
    db_session.add(face)
    await db_session.flush()

    person.cover_face_id = face.id
    db_session.add(
        PersonFace(
            person_id=person.id,
            face_detection_id=face.id,
            score=None,
            source="manual",
        )
    )
    await db_session.commit()

    list_response = await client.get("/api/people", headers=auth_headers)
    assert list_response.status_code == 200
    people = list_response.json()["people"]
    assert len(people) == 1
    assert people[0]["display_name"] == "Jane"
    assert people[0]["face_count"] == 1
    assert people[0]["photo_count"] == 1

    detail_response = await client.get(
        f"/api/people/{person.id}",
        headers=auth_headers,
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["faces"][0]["id"] == str(face.id)
    assert detail["photos"][0]["id"] == str(photo.id)


async def test_cover_face_must_belong_to_person(
    client: AsyncClient,
    auth_headers: dict[str, str],
    db_session: AsyncSession,
):
    """Cover updates reject faces assigned to another person."""
    file_hash = FileHash(
        sha256_hash="d" * 64,
        storage_path="originals/dd/dd/" + "d" * 64 + ".jpg",
        file_extension=".jpg",
        mime_type="image/jpeg",
        file_size=789,
        width=1000,
        height=800,
        reference_count=1,
    )
    first_person = Person(display_name="One", hidden=False)
    second_person = Person(display_name="Two", hidden=False)
    db_session.add_all([file_hash, first_person, second_person])
    await db_session.flush()

    face = FaceDetection(
        id=uuid.uuid4(),
        file_hash_id=file_hash.id,
        model_version="opencv-yunet-sface-v1",
        bbox_left=0.2,
        bbox_top=0.1,
        bbox_width=0.3,
        bbox_height=0.4,
        confidence=0.95,
        quality=0.114,
        landmarks=None,
        embedding=None,
    )
    db_session.add(face)
    await db_session.flush()
    db_session.add(
        PersonFace(
            person_id=second_person.id,
            face_detection_id=face.id,
            score=None,
            source="manual",
        )
    )
    await db_session.commit()

    response = await client.patch(
        f"/api/people/{first_person.id}",
        json={"cover_face_id": str(face.id)},
        headers=auth_headers,
    )

    assert response.status_code == 400
