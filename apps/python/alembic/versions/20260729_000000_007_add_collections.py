"""Add shareable album collections.

Revision ID: 007
Revises: 006
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("access_level", sa.String(length=16), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=True),
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
        sa.CheckConstraint(
            "access_level IN ('public', 'private')",
            name="ck_collections_access_level",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index(op.f("ix_collections_token"), "collections", ["token"])

    op.create_table(
        "collection_albums",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("collection_id", sa.UUID(), nullable=False),
        sa.Column("album_id", sa.UUID(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["collection_id"], ["collections.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "collection_id",
            "album_id",
            name="uq_collection_albums_membership",
        ),
    )
    op.create_index(
        op.f("ix_collection_albums_album_id"),
        "collection_albums",
        ["album_id"],
    )
    op.create_index(
        op.f("ix_collection_albums_collection_id"),
        "collection_albums",
        ["collection_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_collection_albums_collection_id"),
        table_name="collection_albums",
    )
    op.drop_index(
        op.f("ix_collection_albums_album_id"),
        table_name="collection_albums",
    )
    op.drop_table("collection_albums")
    op.drop_index(op.f("ix_collections_token"), table_name="collections")
    op.drop_table("collections")
