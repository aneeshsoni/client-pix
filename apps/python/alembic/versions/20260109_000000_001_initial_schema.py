"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-01-09

This migration creates the initial database schema for Client Pix.
It represents the complete schema as of v0.1.0.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Revision identifiers
revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create all initial tables."""

    # Admins table
    op.create_table(
        "admins",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(100), nullable=True),
        sa.Column("is_owner", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_admins_email", "admins", ["email"], unique=True)

    # File hashes table (for deduplication)
    op.create_table(
        "file_hashes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("sha256_hash", sa.String(64), nullable=False),
        sa.Column("storage_path", sa.String(512), nullable=False),
        sa.Column("file_extension", sa.String(10), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("reference_count", sa.Integer(), nullable=False, default=1),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sha256_hash"),
    )
    op.create_index(
        "ix_file_hashes_sha256_hash", "file_hashes", ["sha256_hash"], unique=True
    )

    # Albums table
    op.create_table(
        "albums",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_photo_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_albums_slug", "albums", ["slug"], unique=True)

    # Photos table
    op.create_table(
        "photos",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "album_id", sa.UUID(), nullable=True
        ),  # Nullable to allow orphaned photos
        sa.Column("file_hash_id", sa.UUID(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("is_video", sa.Boolean(), nullable=False, default=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, default=0),
        sa.Column("caption", sa.Text(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["file_hash_id"], ["file_hashes.id"], ondelete="RESTRICT"
        ),
    )
    op.create_index("ix_photos_album_id", "photos", ["album_id"])
    op.create_index("ix_photos_file_hash_id", "photos", ["file_hash_id"])

    # Share links table
    op.create_table(
        "share_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("album_id", sa.UUID(), nullable=False),
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("custom_slug", sa.String(100), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("is_password_protected", sa.Boolean(), nullable=False, default=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, default=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_share_links_token", "share_links", ["token"], unique=True)
    op.create_index(
        "ix_share_links_custom_slug",
        "share_links",
        ["custom_slug"],
        unique=True,
        postgresql_where=sa.text("custom_slug IS NOT NULL"),
    )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table("share_links")
    op.drop_table("photos")
    op.drop_table("albums")
    op.drop_table("file_hashes")
    op.drop_table("admins")
