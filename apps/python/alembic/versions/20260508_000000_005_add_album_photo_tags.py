"""Add album photo tags

Revision ID: 005
Revises: 004
Create Date: 2026-05-08

This migration adds album-scoped tags and photo-to-tag assignments.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Revision identifiers
revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add photo tag tables."""
    op.create_table(
        "photo_tags",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("album_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("emoji", sa.String(length=16), nullable=True),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("album_id", "name", name="uq_photo_tags_album_name"),
    )
    op.create_index(op.f("ix_photo_tags_album_id"), "photo_tags", ["album_id"])

    op.create_table(
        "photo_tag_assignments",
        sa.Column("photo_id", sa.UUID(), nullable=False),
        sa.Column("tag_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["photo_id"], ["photos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["photo_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("photo_id", "tag_id"),
    )


def downgrade() -> None:
    """Remove photo tag tables."""
    op.drop_table("photo_tag_assignments")
    op.drop_index(op.f("ix_photo_tags_album_id"), table_name="photo_tags")
    op.drop_table("photo_tags")
