"""Face detection, embedding, clustering, and scan queue services."""

from __future__ import annotations

import io
import math
import struct
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from PIL import Image, ImageOps
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import (
    FACE_DETECTION_ENABLED,
    FACE_DETECTION_MODEL_PATH,
    FACE_MATCH_THRESHOLD,
    FACE_MAX_JOB_ATTEMPTS,
    FACE_MIN_DETECTION_CONFIDENCE,
    FACE_MODEL_VERSION,
    FACE_RECOGNITION_MODEL_PATH,
    UPLOAD_DIR,
)
from models.db.face_db_models import (
    FaceDetection,
    FaceScanJob,
    Person,
    PersonFace,
)
from models.db.file_hash_db_models import FileHash
from services.storage_service import storage_service


@dataclass(slots=True)
class FaceCandidate:
    """A face detected by the ML backend."""

    bbox_left: float
    bbox_top: float
    bbox_width: float
    bbox_height: float
    confidence: float
    quality: float
    landmarks: dict | None
    embedding: list[float] | None


@dataclass(slots=True)
class FaceBackendStatus:
    """Readiness status for face recognition."""

    enabled: bool
    ready: bool
    model_version: str
    reason: str | None = None


@dataclass(slots=True)
class EnqueueResult:
    """Summary of a scan enqueue operation."""

    queued_count: int
    skipped_count: int
    total_count: int


class OpenCVFaceBackend:
    """OpenCV YuNet + SFace backend loaded lazily from local ONNX files."""

    def __init__(
        self,
        detection_model_path: Path = FACE_DETECTION_MODEL_PATH,
        recognition_model_path: Path = FACE_RECOGNITION_MODEL_PATH,
        min_confidence: float = FACE_MIN_DETECTION_CONFIDENCE,
    ):
        self.detection_model_path = detection_model_path
        self.recognition_model_path = recognition_model_path
        self.min_confidence = min_confidence
        self._cv2 = None
        self._recognizer = None
        self._load_error: str | None = None

    def status(self) -> FaceBackendStatus:
        """Return whether the backend can currently process images."""
        if not FACE_DETECTION_ENABLED:
            return FaceBackendStatus(
                enabled=False,
                ready=False,
                model_version=FACE_MODEL_VERSION,
                reason="Face detection is disabled",
            )

        missing = [
            str(path)
            for path in (self.detection_model_path, self.recognition_model_path)
            if not path.exists()
        ]
        if missing:
            return FaceBackendStatus(
                enabled=True,
                ready=False,
                model_version=FACE_MODEL_VERSION,
                reason=f"Missing model file(s): {', '.join(missing)}",
            )

        try:
            self._ensure_loaded()
        except Exception as exc:  # pragma: no cover - depends on local cv2 install
            return FaceBackendStatus(
                enabled=True,
                ready=False,
                model_version=FACE_MODEL_VERSION,
                reason=str(exc),
            )

        return FaceBackendStatus(
            enabled=True,
            ready=True,
            model_version=FACE_MODEL_VERSION,
        )

    def _ensure_loaded(self) -> None:
        if self._cv2 is not None and self._recognizer is not None:
            return

        try:
            import cv2  # type: ignore[import-not-found]
        except Exception as exc:  # pragma: no cover - depends on environment
            raise RuntimeError("OpenCV is not installed") from exc

        if not hasattr(cv2, "FaceDetectorYN_create") or not hasattr(
            cv2,
            "FaceRecognizerSF_create",
        ):
            raise RuntimeError("Installed OpenCV build lacks face recognition APIs")

        self._cv2 = cv2
        self._recognizer = cv2.FaceRecognizerSF_create(
            str(self.recognition_model_path),
            "",
        )

    def detect_faces(self, image_path: Path) -> list[FaceCandidate]:
        """Detect faces and extract SFace embeddings from an image path."""
        self._ensure_loaded()
        cv2 = self._cv2
        if cv2 is None or self._recognizer is None:
            raise RuntimeError("Face backend is not loaded")

        image = cv2.imread(str(image_path))
        if image is None:
            raise RuntimeError(f"Could not read image for face detection: {image_path}")

        height, width = image.shape[:2]
        detector = cv2.FaceDetectorYN_create(
            str(self.detection_model_path),
            "",
            (width, height),
            score_threshold=self.min_confidence,
            nms_threshold=0.3,
            top_k=5000,
        )
        result = detector.detect(image)
        faces = result[1] if isinstance(result, tuple) else result
        if faces is None:
            return []

        candidates: list[FaceCandidate] = []
        for face in faces:
            x, y, w, h = [float(v) for v in face[:4]]
            confidence = float(face[-1])
            if confidence < self.min_confidence:
                continue

            embedding: list[float] | None = None
            try:
                aligned = self._recognizer.alignCrop(image, face)
                feature = self._recognizer.feature(aligned)
                values = feature.flatten().astype("float32")
                norm = float(math.sqrt(float((values * values).sum())))
                if norm > 0:
                    values = values / norm
                embedding = [float(value) for value in values.tolist()]
            except Exception:
                embedding = None

            landmarks = {
                "points": [
                    {
                        "x": _normalize(float(face[4 + i * 2]), width),
                        "y": _normalize(float(face[5 + i * 2]), height),
                    }
                    for i in range(5)
                ]
            }
            norm_width = _normalize(w, width)
            norm_height = _normalize(h, height)
            candidates.append(
                FaceCandidate(
                    bbox_left=_normalize(x, width),
                    bbox_top=_normalize(y, height),
                    bbox_width=norm_width,
                    bbox_height=norm_height,
                    confidence=confidence,
                    quality=confidence * norm_width * norm_height,
                    landmarks=landmarks,
                    embedding=embedding,
                )
            )

        return candidates


def _normalize(value: float, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return max(0.0, min(1.0, value / denominator))


def _pack_embedding(values: list[float] | None) -> bytes | None:
    if not values:
        return None
    return struct.pack(f"{len(values)}f", *values)


def _unpack_embedding(value: bytes | None) -> list[float] | None:
    if not value:
        return None
    if len(value) % 4 != 0:
        return None
    return list(struct.unpack(f"{len(value) // 4}f", value))


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return -1.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm <= 0 or right_norm <= 0:
        return -1.0
    return dot / (left_norm * right_norm)


class FaceRecognitionService:
    """Coordinates face scan jobs, detection persistence, and person clustering."""

    def __init__(self, backend: OpenCVFaceBackend | None = None):
        self.backend = backend or OpenCVFaceBackend()

    def status(self) -> FaceBackendStatus:
        """Return current backend status."""
        return self.backend.status()

    async def enqueue_file_hash(
        self,
        db: AsyncSession,
        file_hash_id: uuid.UUID,
        *,
        force: bool = False,
    ) -> bool:
        """Queue one image hash for scanning. Returns True when queued/reset."""
        if not FACE_DETECTION_ENABLED:
            return False

        file_hash = await db.get(FileHash, file_hash_id)
        if not file_hash or file_hash.mime_type.startswith("video/"):
            return False

        existing_result = await db.execute(
            select(FaceScanJob).where(
                FaceScanJob.file_hash_id == file_hash_id,
                FaceScanJob.model_version == FACE_MODEL_VERSION,
            )
        )
        existing = existing_result.scalar_one_or_none()

        if existing:
            if not force:
                return False
            existing.status = "queued"
            existing.attempts = 0
            existing.error = None
            existing.started_at = None
            existing.completed_at = None
            return True

        db.add(
            FaceScanJob(
                file_hash_id=file_hash_id,
                model_version=FACE_MODEL_VERSION,
                status="queued",
                attempts=0,
            )
        )
        return True

    async def enqueue_existing_images(
        self,
        db: AsyncSession,
        *,
        force: bool = False,
    ) -> EnqueueResult:
        """Queue existing non-video image hashes for a backfill scan."""
        result = await db.execute(
            select(FileHash).where(~FileHash.mime_type.startswith("video/"))
        )
        file_hashes = list(result.scalars().all())
        queued = 0

        for file_hash in file_hashes:
            if await self.enqueue_file_hash(db, file_hash.id, force=force):
                queued += 1

        return EnqueueResult(
            queued_count=queued,
            skipped_count=len(file_hashes) - queued,
            total_count=len(file_hashes),
        )

    async def retry_failed_jobs(self, db: AsyncSession) -> int:
        """Move failed current-model jobs back to queued."""
        result = await db.execute(
            select(FaceScanJob).where(
                FaceScanJob.model_version == FACE_MODEL_VERSION,
                FaceScanJob.status == "failed",
            )
        )
        jobs = list(result.scalars().all())
        for job in jobs:
            job.status = "queued"
            job.error = None
            job.started_at = None
            job.completed_at = None
        return len(jobs)

    async def claim_next_job(self, db: AsyncSession) -> uuid.UUID | None:
        """Claim the next queued scan job for processing."""
        result = await db.execute(
            select(FaceScanJob)
            .where(
                FaceScanJob.model_version == FACE_MODEL_VERSION,
                FaceScanJob.status == "queued",
                FaceScanJob.attempts < FACE_MAX_JOB_ATTEMPTS,
            )
            .order_by(FaceScanJob.created_at.asc())
            .limit(1)
        )
        job = result.scalar_one_or_none()
        if not job:
            return None

        job.status = "processing"
        job.attempts += 1
        job.error = None
        job.started_at = datetime.now(UTC)
        job.completed_at = None
        await db.commit()
        return job.id

    async def process_job(self, db: AsyncSession, job_id: uuid.UUID) -> None:
        """Process one claimed scan job."""
        job = await db.get(FaceScanJob, job_id)
        if not job:
            return

        try:
            file_hash = await db.get(FileHash, job.file_hash_id)
            if not file_hash:
                raise RuntimeError("File hash no longer exists")

            candidates = self.backend.detect_faces(self._get_scan_image_path(file_hash))
            await self._replace_detections(db, file_hash.id, candidates)
            job.status = "completed"
            job.error = None
            job.completed_at = datetime.now(UTC)
        except Exception as exc:
            job.status = "failed" if job.attempts >= FACE_MAX_JOB_ATTEMPTS else "queued"
            job.error = str(exc)
            job.completed_at = datetime.now(UTC)

        await db.commit()

    def _get_scan_image_path(self, file_hash: FileHash) -> Path:
        web_path = storage_service.get_file_path(
            file_hash.sha256_hash,
            file_hash.file_extension,
            variant=storage_service.VARIANT_WEB,
        )
        if web_path.exists():
            return web_path

        original_path = storage_service.get_file_path(
            file_hash.sha256_hash,
            file_hash.file_extension,
            variant=storage_service.VARIANT_ORIGINAL,
        )
        if original_path.exists():
            return original_path

        upload_path = UPLOAD_DIR / file_hash.storage_path
        if upload_path.exists():
            return upload_path

        raise RuntimeError("Image file not found on disk")

    async def _replace_detections(
        self,
        db: AsyncSession,
        file_hash_id: uuid.UUID,
        candidates: list[FaceCandidate],
    ) -> None:
        existing_ids_result = await db.execute(
            select(FaceDetection.id).where(
                FaceDetection.file_hash_id == file_hash_id,
                FaceDetection.model_version == FACE_MODEL_VERSION,
            )
        )
        existing_ids = list(existing_ids_result.scalars().all())
        if existing_ids:
            await db.execute(
                update(Person)
                .where(Person.cover_face_id.in_(existing_ids))
                .values(cover_face_id=None)
            )
            await db.execute(
                delete(PersonFace).where(PersonFace.face_detection_id.in_(existing_ids))
            )
            await db.execute(
                delete(FaceDetection).where(FaceDetection.id.in_(existing_ids))
            )
            await db.flush()

        representatives = await self._load_representatives(db)
        for candidate in candidates:
            face = FaceDetection(
                file_hash_id=file_hash_id,
                model_version=FACE_MODEL_VERSION,
                bbox_left=candidate.bbox_left,
                bbox_top=candidate.bbox_top,
                bbox_width=candidate.bbox_width,
                bbox_height=candidate.bbox_height,
                confidence=candidate.confidence,
                quality=candidate.quality,
                landmarks=candidate.landmarks,
                embedding=_pack_embedding(candidate.embedding),
            )
            db.add(face)
            await db.flush()

            if not candidate.embedding:
                continue

            person, score = await self._find_or_create_person(
                db,
                candidate.embedding,
                representatives,
            )
            db.add(
                PersonFace(
                    person_id=person.id,
                    face_detection_id=face.id,
                    score=score,
                    source="auto",
                )
            )
            if person.cover_face_id is None:
                person.cover_face_id = face.id
            representatives.append((person.id, candidate.embedding))

    async def _load_representatives(
        self,
        db: AsyncSession,
    ) -> list[tuple[uuid.UUID, list[float]]]:
        result = await db.execute(
            select(PersonFace.person_id, FaceDetection.embedding)
            .join(FaceDetection, FaceDetection.id == PersonFace.face_detection_id)
            .where(
                FaceDetection.model_version == FACE_MODEL_VERSION,
                FaceDetection.embedding.is_not(None),
            )
        )
        representatives: list[tuple[uuid.UUID, list[float]]] = []
        for person_id, embedding_blob in result.all():
            embedding = _unpack_embedding(embedding_blob)
            if embedding:
                representatives.append((person_id, embedding))
        return representatives

    async def _find_or_create_person(
        self,
        db: AsyncSession,
        embedding: list[float],
        representatives: list[tuple[uuid.UUID, list[float]]],
    ) -> tuple[Person, float | None]:
        best_person_id: uuid.UUID | None = None
        best_score = -1.0
        for person_id, representative in representatives:
            score = _cosine_similarity(embedding, representative)
            if score > best_score:
                best_score = score
                best_person_id = person_id

        if best_person_id is not None and best_score >= FACE_MATCH_THRESHOLD:
            person = await db.get(Person, best_person_id)
            if person:
                return person, best_score

        count_result = await db.execute(select(func.count(Person.id)))
        person_number = int(count_result.scalar() or 0) + 1
        person = Person(display_name=f"Person {person_number}", hidden=False)
        db.add(person)
        await db.flush()
        return person, None

    async def create_face_crop(self, db: AsyncSession, face_id: uuid.UUID) -> bytes:
        """Return a WebP crop for one detected face."""
        result = await db.execute(
            select(FaceDetection, FileHash)
            .join(FileHash, FileHash.id == FaceDetection.file_hash_id)
            .where(FaceDetection.id == face_id)
        )
        row = result.one_or_none()
        if not row:
            raise FileNotFoundError("Face not found")

        face, file_hash = row
        image_path = self._get_scan_image_path(file_hash)
        with Image.open(image_path) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            width, height = image.size
            left = face.bbox_left * width
            top = face.bbox_top * height
            face_width = face.bbox_width * width
            face_height = face.bbox_height * height
            margin = max(face_width, face_height) * 0.35
            crop_box = (
                max(0, int(left - margin)),
                max(0, int(top - margin)),
                min(width, int(left + face_width + margin)),
                min(height, int(top + face_height + margin)),
            )
            crop = image.crop(crop_box)
            crop.thumbnail((640, 640), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            crop.save(buffer, "WEBP", quality=88)
            return buffer.getvalue()


face_recognition_service = FaceRecognitionService()
