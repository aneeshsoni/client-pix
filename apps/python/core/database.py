"""Database connection and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy import text, inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.config import DATABASE_URL, DEBUG
from models.db.base import Base

# Import all models to register them with SQLAlchemy
from models.db.admin_db_models import Admin  # noqa: F401
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
    """Create all database tables and run migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Run schema migrations for existing databases
        await conn.run_sync(_migrate_share_links_custom_slug)


def _migrate_share_links_custom_slug(conn):
    """Add custom_slug column to share_links table if it doesn't exist.

    This is a sync function called via run_sync from async context.
    """
    try:
        # Check if column exists using sync inspector
        inspector = inspect(conn)
        columns = [col["name"] for col in inspector.get_columns("share_links")]

        if "custom_slug" not in columns:
            print("⚠️  Adding custom_slug column to share_links table...")
            # Add column as nullable first (PostgreSQL doesn't allow UNIQUE in ADD COLUMN)
            conn.execute(
                text("ALTER TABLE share_links ADD COLUMN custom_slug VARCHAR(100)")
            )
            # Create unique index (PostgreSQL allows unique indexes on nullable columns)
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_share_links_custom_slug ON share_links(custom_slug) WHERE custom_slug IS NOT NULL"
                )
            )
            print("✓ Migration complete: custom_slug column added")
    except Exception as e:
        # Table might not exist yet, that's OK - create_all will handle it
        if "does not exist" not in str(e).lower():
            print(f"⚠️  Migration check failed (non-critical): {e}")
