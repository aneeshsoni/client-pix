"""Add optional adaptive video streaming.

Revision ID: 008
Revises: 007
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "file_hashes", sa.Column("duration_seconds", sa.Float(), nullable=True)
    )
    op.create_table(
        "video_streaming_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "video_transcode_jobs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("file_hash_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["file_hash_id"], ["file_hashes.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_hash_id"),
    )
    op.create_index(
        op.f("ix_video_transcode_jobs_file_hash_id"),
        "video_transcode_jobs",
        ["file_hash_id"],
    )
    op.create_index(
        op.f("ix_video_transcode_jobs_status"),
        "video_transcode_jobs",
        ["status"],
    )
    op.create_table(
        "video_renditions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("file_hash_id", sa.UUID(), nullable=False),
        sa.Column("quality_label", sa.String(length=20), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("video_bitrate", sa.Integer(), nullable=False),
        sa.Column("audio_bitrate", sa.Integer(), nullable=False),
        sa.Column("playlist_path", sa.String(length=512), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["file_hash_id"], ["file_hashes.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "file_hash_id", "quality_label", name="uq_video_rendition_quality"
        ),
    )
    op.create_index(
        op.f("ix_video_renditions_file_hash_id"),
        "video_renditions",
        ["file_hash_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_video_renditions_file_hash_id"), table_name="video_renditions"
    )
    op.drop_table("video_renditions")
    op.drop_index(
        op.f("ix_video_transcode_jobs_status"), table_name="video_transcode_jobs"
    )
    op.drop_index(
        op.f("ix_video_transcode_jobs_file_hash_id"),
        table_name="video_transcode_jobs",
    )
    op.drop_table("video_transcode_jobs")
    op.drop_table("video_streaming_settings")
    op.drop_column("file_hashes", "duration_seconds")
