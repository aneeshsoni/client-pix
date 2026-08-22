"""Collection and collection-album database models."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db.base import Base


class Collection(Base):
    """A shareable, ordered group of albums."""

    __tablename__ = "collections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    custom_slug: Mapped[str | None] = mapped_column(
        String(100), unique=True, nullable=True, index=True
    )
    access_level: Mapped[str] = mapped_column(
        String(16), nullable=False, default="public"
    )
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    album_links: Mapped[list["CollectionAlbum"]] = relationship(
        "CollectionAlbum",
        back_populates="collection",
        cascade="all, delete-orphan",
        order_by="CollectionAlbum.sort_order",
    )


class CollectionAlbum(Base):
    """Ordered many-to-many association between collections and albums."""

    __tablename__ = "collection_albums"
    __table_args__ = (
        UniqueConstraint(
            "collection_id", "album_id", name="uq_collection_albums_membership"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    album_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("albums.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    collection: Mapped[Collection] = relationship(
        "Collection", back_populates="album_links"
    )
    album: Mapped["Album"] = relationship(  # noqa: F821
        "Album", back_populates="collection_links"
    )
