"""Add administrator-configurable upload limits.

Revision ID: 006
Revises: 005
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "upload_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("max_upload_file_bytes", sa.BigInteger(), nullable=False),
        sa.Column("max_shared_upload_file_bytes", sa.BigInteger(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_upload_settings_singleton"),
    )


def downgrade() -> None:
    op.drop_table("upload_settings")
