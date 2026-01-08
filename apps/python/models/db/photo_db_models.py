"""Photo database model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db.base import Base


class Photo(Base):
    """
    Photo model - represents a single photo in an album.

    The actual file is referenced via file_hash_id (for deduplication).
    Multiple Photo records can share the same FileHash.
    Photos can exist without an album (orphaned/unassociated photos).
    """

    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Album this photo belongs to (nullable - photos can be unassociated)
    album_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("albums.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Reference to the actual file (for deduplication)
    file_hash_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("file_hashes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Original filename as uploaded by the photographer
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)

    # Display order within album
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Optional caption/description for this photo
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)

    # EXIF data (captured date, camera info, etc.)
    captured_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    camera_make: Mapped[str | None] = mapped_column(String(100), nullable=True)
    camera_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    album: Mapped["Album"] = relationship(  # noqa: F821
        "Album",
        back_populates="photos",
    )
    file_hash: Mapped["FileHash"] = relationship(  # noqa: F821
        "FileHash",
    )

    def __repr__(self) -> str:
        return f"<Photo(id={self.id}, filename='{self.original_filename}')>"
