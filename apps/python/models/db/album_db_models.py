"""Album database model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db.base import Base


class Album(Base):
    """Album model - a collection of photos."""

    __tablename__ = "albums"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    slug: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )

    # Cover photo (optional, references a photo in this album)
    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )

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
    photos: Mapped[list["Photo"]] = relationship(  # noqa: F821
        "Photo",
        back_populates="album",
        cascade="all, delete-orphan",
    )
    share_links: Mapped[list["ShareLink"]] = relationship(  # noqa: F821
        "ShareLink",
        back_populates="album",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Album(id={self.id}, title='{self.title}')>"
