"""Add 2FA fields to admins table

Revision ID: 002
Revises: 001
Create Date: 2026-01-15

This migration adds two-factor authentication fields to the admins table.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Revision identifiers
revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add 2FA columns to admins table."""
    op.add_column(
        "admins",
        sa.Column("totp_secret", sa.String(255), nullable=True),
    )
    op.add_column(
        "admins",
        sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "admins",
        sa.Column("backup_codes", sa.String(1024), nullable=True),
    )


def downgrade() -> None:
    """Remove 2FA columns from admins table."""
    op.drop_column("admins", "backup_codes")
    op.drop_column("admins", "totp_enabled")
    op.drop_column("admins", "totp_secret")
