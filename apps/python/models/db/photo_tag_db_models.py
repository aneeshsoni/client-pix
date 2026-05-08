"""Photo tag database models."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db.base import Base


photo_tag_assignments = Table(
    "photo_tag_assignments",
    Base.metadata,
    Column(
        "photo_id",
        UUID(as_uuid=True),
        ForeignKey("photos.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        UUID(as_uuid=True),
        ForeignKey("photo_tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class PhotoTag(Base):
    """Album-scoped tag that can be assigned to photos."""

    __tablename__ = "photo_tags"
    __table_args__ = (
        UniqueConstraint("album_id", "name", name="uq_photo_tags_album_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    album_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("albums.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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

    album: Mapped["Album"] = relationship("Album")  # noqa: F821
    photos: Mapped[list["Photo"]] = relationship(  # noqa: F821
        "Photo",
        secondary=photo_tag_assignments,
        back_populates="tags",
    )

    def __repr__(self) -> str:
        return f"<PhotoTag(id={self.id}, album_id={self.album_id})>"
