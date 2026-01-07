"""Database connection and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.config import DATABASE_URL, DEBUG
from models.db.base import Base

# Import all models to register them with SQLAlchemy
from models.db.album_db_models import Album  # noqa: F401
from models.db.file_hash_db_models import FileHash  # noqa: F401
from models.db.photo_db_models import Photo  # noqa: F401
from models.db.share_link_db_models import ShareLink  # noqa: F401

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=DEBUG,  # Log SQL queries in debug mode
    future=True,
)

# Session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides a database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
