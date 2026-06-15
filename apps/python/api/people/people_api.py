"""People and face recognition API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, distinct, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from models.api.people_api_models import (
    FaceBoxResponse,
    FaceDetectionResponse,
    FaceScanBackfillRequest,
    FaceScanBackfillResponse,
    FaceScanRetryResponse,
    FaceScanStatusResponse,
    PeopleListResponse,
    PersonDetailResponse,
    PersonFacesAddRequest,
    PersonMergeRequest,
    PersonResponse,
    PersonUpdate,
)
from models.db.face_db_models import FaceDetection, FaceScanJob, Person, PersonFace
from models.db.file_hash_db_models import FileHash
from models.db.photo_db_models import Photo
from services.face_recognition_service import face_recognition_service
from utils.auth_util import get_admin_from_token_or_query
from utils.response_util import build_photo_response

router = APIRouter(
    tags=["people"], dependencies=[Depends(get_admin_from_token_or_query)]
)


def _build_face_response(face: FaceDetection) -> FaceDetectionResponse:
    return FaceDetectionResponse(
        id=face.id,
        file_hash_id=face.file_hash_id,
        bbox=FaceBoxResponse(
            left=face.bbox_left,
            top=face.bbox_top,
            width=face.bbox_width,
            height=face.bbox_height,
        ),
        confidence=face.confidence,
        quality=face.quality,
        created_at=face.created_at,
    )


def _build_person_response(
    person: Person,
    face_count: int,
    photo_count: int,
) -> PersonResponse:
    return PersonResponse(
        id=person.id,
        display_name=person.display_name,
        hidden=person.hidden,
        cover_face_id=person.cover_face_id,
        face_count=face_count,
        photo_count=photo_count,
        created_at=person.created_at,
        updated_at=person.updated_at,
    )


def _person_counts_subquery():
    return (
        select(
            PersonFace.person_id.label("person_id"),
            func.count(distinct(PersonFace.face_detection_id)).label("face_count"),
            func.count(distinct(Photo.id)).label("photo_count"),
        )
        .join(FaceDetection, FaceDetection.id == PersonFace.face_detection_id)
        .outerjoin(Photo, Photo.file_hash_id == FaceDetection.file_hash_id)
        .group_by(PersonFace.person_id)
        .subquery()
    )


async def _get_person_or_404(db: AsyncSession, person_id: uuid.UUID) -> Person:
    person = await db.get(Person, person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.get("/people", response_model=PeopleListResponse)
async def list_people(
    include_hidden: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """List detected people."""
    counts = _person_counts_subquery()
    stmt = (
        select(
            Person,
            func.coalesce(counts.c.face_count, 0),
            func.coalesce(counts.c.photo_count, 0),
        )
        .outerjoin(counts, counts.c.person_id == Person.id)
        .order_by(Person.hidden.asc(), Person.display_name.asc())
    )
    if not include_hidden:
        stmt = stmt.where(~Person.hidden)

    result = await db.execute(stmt)
    people = [
        _build_person_response(person, int(face_count), int(photo_count))
        for person, face_count, photo_count in result.all()
    ]
    return PeopleListResponse(people=people, total_count=len(people))


@router.get("/people/{person_id}", response_model=PersonDetailResponse)
async def get_person(
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get one person with associated faces and photos."""
    person = await _get_person_or_404(db, person_id)

    face_result = await db.execute(
        select(FaceDetection)
        .join(PersonFace, PersonFace.face_detection_id == FaceDetection.id)
        .where(PersonFace.person_id == person_id)
        .order_by(FaceDetection.quality.desc(), FaceDetection.created_at.asc())
    )
    faces = list(face_result.scalars().all())
    file_hash_ids = {face.file_hash_id for face in faces}

    photos = []
    if file_hash_ids:
        photo_result = await db.execute(
            select(Photo)
            .where(Photo.file_hash_id.in_(file_hash_ids))
            .options(selectinload(Photo.file_hash), selectinload(Photo.tags))
            .order_by(Photo.captured_at.asc().nullslast(), Photo.created_at.asc())
        )
        photos = [build_photo_response(photo) for photo in photo_result.scalars().all()]

    photo_count = len({photo.id for photo in photos})
    response = _build_person_response(person, len(faces), photo_count)
    return PersonDetailResponse(
        **response.model_dump(),
        photos=photos,
        faces=[_build_face_response(face) for face in faces],
    )


@router.patch("/people/{person_id}", response_model=PersonResponse)
async def update_person(
    person_id: uuid.UUID,
    data: PersonUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Rename, hide, or set the cover face for a person."""
    person = await _get_person_or_404(db, person_id)

    if data.display_name is not None:
        person.display_name = data.display_name.strip()
    if data.hidden is not None:
        person.hidden = data.hidden
    if "cover_face_id" in data.model_fields_set:
        if data.cover_face_id is not None:
            assignment_result = await db.execute(
                select(PersonFace).where(
                    PersonFace.person_id == person_id,
                    PersonFace.face_detection_id == data.cover_face_id,
                )
            )
            if not assignment_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=400,
                    detail="Cover face must belong to this person",
                )
        person.cover_face_id = data.cover_face_id

    await db.commit()
    await db.refresh(person)
    counts = await _get_person_counts(db, person_id)
    return _build_person_response(person, counts[0], counts[1])


@router.post("/people/{person_id}/merge", response_model=PersonResponse)
async def merge_people(
    person_id: uuid.UUID,
    data: PersonMergeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Merge source people into the target person."""
    target = await _get_person_or_404(db, person_id)
    source_ids = [
        source_id for source_id in data.source_person_ids if source_id != person_id
    ]
    if not source_ids:
        raise HTTPException(status_code=400, detail="No source people to merge")

    source_result = await db.execute(select(Person).where(Person.id.in_(source_ids)))
    sources = list(source_result.scalars().all())
    if len(sources) != len(set(source_ids)):
        raise HTTPException(
            status_code=404, detail="One or more source people not found"
        )

    if target.cover_face_id is None:
        for source in sources:
            if source.cover_face_id is not None:
                target.cover_face_id = source.cover_face_id
                break

    await db.execute(
        update(PersonFace)
        .where(PersonFace.person_id.in_(source_ids))
        .values(person_id=person_id, source="merged")
    )
    for source in sources:
        await db.delete(source)

    await db.commit()
    await db.refresh(target)
    counts = await _get_person_counts(db, person_id)
    return _build_person_response(target, counts[0], counts[1])


@router.post("/people/{person_id}/faces", response_model=PersonDetailResponse)
async def add_faces_to_person(
    person_id: uuid.UUID,
    data: PersonFacesAddRequest,
    db: AsyncSession = Depends(get_db),
):
    """Manually assign detected faces to a person."""
    person = await _get_person_or_404(db, person_id)
    face_result = await db.execute(
        select(FaceDetection.id).where(FaceDetection.id.in_(data.face_ids))
    )
    found_face_ids = set(face_result.scalars().all())
    if len(found_face_ids) != len(set(data.face_ids)):
        raise HTTPException(status_code=404, detail="One or more faces not found")

    await db.execute(
        delete(PersonFace).where(PersonFace.face_detection_id.in_(found_face_ids))
    )
    for face_id in found_face_ids:
        db.add(
            PersonFace(
                person_id=person_id,
                face_detection_id=face_id,
                score=None,
                source="manual",
            )
        )
    if person.cover_face_id is None:
        person.cover_face_id = next(iter(found_face_ids))

    await db.commit()
    return await get_person(person_id, db)


@router.delete("/people/{person_id}/faces/{face_id}", status_code=204)
async def remove_face_from_person(
    person_id: uuid.UUID,
    face_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Remove one detected face assignment from a person."""
    person = await _get_person_or_404(db, person_id)
    result = await db.execute(
        select(PersonFace).where(
            PersonFace.person_id == person_id,
            PersonFace.face_detection_id == face_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Face assignment not found")

    await db.delete(assignment)
    if person.cover_face_id == face_id:
        next_face_result = await db.execute(
            select(PersonFace.face_detection_id)
            .where(
                PersonFace.person_id == person_id,
                PersonFace.face_detection_id != face_id,
            )
            .limit(1)
        )
        person.cover_face_id = next_face_result.scalar_one_or_none()

    await db.commit()


@router.get("/faces/{face_id}/crop")
async def get_face_crop(
    face_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Return an authenticated cropped face image."""
    try:
        crop = await face_recognition_service.create_face_crop(db, face_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return Response(
        content=crop,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=31536000"},
    )


@router.post("/face-scans/backfill", response_model=FaceScanBackfillResponse)
async def enqueue_face_scan_backfill(
    data: FaceScanBackfillRequest,
    db: AsyncSession = Depends(get_db),
):
    """Queue existing images for face scanning."""
    result = await face_recognition_service.enqueue_existing_images(
        db,
        force=data.force,
    )
    await db.commit()
    return FaceScanBackfillResponse(
        queued_count=result.queued_count,
        skipped_count=result.skipped_count,
        total_count=result.total_count,
    )


@router.get("/face-scans/status", response_model=FaceScanStatusResponse)
async def get_face_scan_status(db: AsyncSession = Depends(get_db)):
    """Return face scan backend and queue status."""
    backend_status = face_recognition_service.status()

    total_result = await db.execute(
        select(func.count(FileHash.id)).where(~FileHash.mime_type.startswith("video/"))
    )
    total_images = int(total_result.scalar() or 0)

    counts_result = await db.execute(
        select(FaceScanJob.status, func.count(FaceScanJob.id))
        .where(FaceScanJob.model_version == backend_status.model_version)
        .group_by(FaceScanJob.status)
    )
    counts = {status: int(count) for status, count in counts_result.all()}
    tracked = sum(counts.values())

    last_error_result = await db.execute(
        select(FaceScanJob.error)
        .where(
            FaceScanJob.model_version == backend_status.model_version,
            FaceScanJob.status == "failed",
            FaceScanJob.error.is_not(None),
        )
        .order_by(FaceScanJob.completed_at.desc().nullslast())
        .limit(1)
    )

    return FaceScanStatusResponse(
        enabled=backend_status.enabled,
        ready=backend_status.ready,
        model_version=backend_status.model_version,
        reason=backend_status.reason,
        total_images=total_images,
        queued=counts.get("queued", 0),
        processing=counts.get("processing", 0),
        completed=counts.get("completed", 0),
        failed=counts.get("failed", 0),
        skipped=max(0, total_images - tracked),
        last_error=last_error_result.scalar_one_or_none(),
    )


@router.post("/face-scans/retry-failed", response_model=FaceScanRetryResponse)
async def retry_failed_face_scans(db: AsyncSession = Depends(get_db)):
    """Retry failed face scan jobs."""
    retried_count = await face_recognition_service.retry_failed_jobs(db)
    await db.commit()
    return FaceScanRetryResponse(retried_count=retried_count)


async def _get_person_counts(
    db: AsyncSession,
    person_id: uuid.UUID,
) -> tuple[int, int]:
    counts = _person_counts_subquery()
    result = await db.execute(
        select(
            func.coalesce(counts.c.face_count, 0),
            func.coalesce(counts.c.photo_count, 0),
        ).where(counts.c.person_id == person_id)
    )
    row = result.one_or_none()
    if not row:
        return 0, 0
    return int(row[0]), int(row[1])
