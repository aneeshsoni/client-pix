"""FileHash database model for deduplication tracking."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from models.db.base import Base


class FileHash(Base):
    """
    Tracks unique files by their SHA256 hash.

    Multiple photos can reference the same file hash (deduplication).
    The file is only deleted when reference_count reaches 0.
    """

    __tablename__ = "file_hashes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # SHA256 hash of the file contents (64 hex characters)
    sha256_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        index=True,
    )

    # Storage path relative to upload directory (e.g., "originals/ab/cd/abcd...")
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)

    # Original file extension (e.g., ".jpg", ".png")
    file_extension: Mapped[str] = mapped_column(String(10), nullable=False)

    # MIME type
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)

    # File size in bytes
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Image dimensions
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)

    # How many Photo records reference this file
    reference_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<FileHash(hash={self.sha256_hash[:8]}..., refs={self.reference_count})>"
        )
