"""Add face recognition tables

Revision ID: 006
Revises: 005
Create Date: 2026-06-15

This migration adds a DB-backed face scan queue, detected faces, person
identities, and face-to-person assignments.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# Revision identifiers
revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add face recognition tables."""
    op.create_table(
        "face_scan_jobs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("file_hash_id", sa.UUID(), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
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
        sa.UniqueConstraint(
            "file_hash_id",
            "model_version",
            name="uq_face_scan_jobs_file_hash_model",
        ),
    )
    op.create_index(
        op.f("ix_face_scan_jobs_file_hash_id"), "face_scan_jobs", ["file_hash_id"]
    )
    op.create_index(
        op.f("ix_face_scan_jobs_model_version"), "face_scan_jobs", ["model_version"]
    )
    op.create_index(op.f("ix_face_scan_jobs_status"), "face_scan_jobs", ["status"])

    op.create_table(
        "people",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("hidden", sa.Boolean(), nullable=False),
        sa.Column("cover_face_id", sa.UUID(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "face_detections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("file_hash_id", sa.UUID(), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("bbox_left", sa.Float(), nullable=False),
        sa.Column("bbox_top", sa.Float(), nullable=False),
        sa.Column("bbox_width", sa.Float(), nullable=False),
        sa.Column("bbox_height", sa.Float(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("quality", sa.Float(), nullable=False),
        sa.Column("landmarks", sa.JSON(), nullable=True),
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
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
    )
    op.create_index(
        op.f("ix_face_detections_file_hash_id"), "face_detections", ["file_hash_id"]
    )
    op.create_index(
        op.f("ix_face_detections_model_version"), "face_detections", ["model_version"]
    )

    op.create_table(
        "person_faces",
        sa.Column("person_id", sa.UUID(), nullable=False),
        sa.Column("face_detection_id", sa.UUID(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["face_detection_id"], ["face_detections.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("person_id", "face_detection_id"),
        sa.UniqueConstraint("face_detection_id", name="uq_person_faces_face_detection"),
    )


def downgrade() -> None:
    """Remove face recognition tables."""
    op.drop_table("person_faces")
    op.drop_index(
        op.f("ix_face_detections_model_version"), table_name="face_detections"
    )
    op.drop_index(op.f("ix_face_detections_file_hash_id"), table_name="face_detections")
    op.drop_table("face_detections")
    op.drop_table("people")
    op.drop_index(op.f("ix_face_scan_jobs_status"), table_name="face_scan_jobs")
    op.drop_index(op.f("ix_face_scan_jobs_model_version"), table_name="face_scan_jobs")
    op.drop_index(op.f("ix_face_scan_jobs_file_hash_id"), table_name="face_scan_jobs")
    op.drop_table("face_scan_jobs")
