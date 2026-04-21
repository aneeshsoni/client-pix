"""Add per-share-link upload toggle

Revision ID: 004
Revises: 003
Create Date: 2026-04-20

This migration adds a per-share-link flag to control whether the
public link can upload files into its album.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Revision identifiers
revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add allows_uploads to share_links."""
    op.add_column(
        "share_links",
        sa.Column(
            "allows_uploads",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    """Remove allows_uploads from share_links."""
    op.drop_column("share_links", "allows_uploads")
