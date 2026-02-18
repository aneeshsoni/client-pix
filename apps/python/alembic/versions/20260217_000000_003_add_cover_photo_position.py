"""Add cover photo position fields to albums table

Revision ID: 003
Revises: 002
Create Date: 2026-02-17

This migration adds focal point position fields for album cover photos.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Revision identifiers
revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add cover photo position columns to albums table."""
    op.add_column(
        "albums",
        sa.Column(
            "cover_photo_position_x", sa.Float(), nullable=False, server_default="50"
        ),
    )
    op.add_column(
        "albums",
        sa.Column(
            "cover_photo_position_y", sa.Float(), nullable=False, server_default="50"
        ),
    )


def downgrade() -> None:
    """Remove cover photo position columns from albums table."""
    op.drop_column("albums", "cover_photo_position_y")
    op.drop_column("albums", "cover_photo_position_x")
