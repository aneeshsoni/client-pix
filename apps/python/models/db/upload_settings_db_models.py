"""Persisted upload limit settings."""

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from models.db.base import Base


class UploadSettings(Base):
    """Singleton row containing administrator-controlled upload limits."""

    __tablename__ = "upload_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    max_upload_file_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    max_shared_upload_file_bytes: Mapped[int] = mapped_column(
        BigInteger, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
