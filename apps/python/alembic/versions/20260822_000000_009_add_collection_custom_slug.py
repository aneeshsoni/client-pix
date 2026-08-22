"""Add custom slugs to collection share links.

Revision ID: 009
Revises: 008
Create Date: 2026-08-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "collections",
        sa.Column("custom_slug", sa.String(length=100), nullable=True),
    )
    op.create_index(
        "ix_collections_custom_slug",
        "collections",
        ["custom_slug"],
        unique=True,
        postgresql_where=sa.text("custom_slug IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_collections_custom_slug", table_name="collections")
    op.drop_column("collections", "custom_slug")
