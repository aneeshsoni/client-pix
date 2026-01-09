"""Database connection and session management."""

import os
from collections.abc import AsyncGenerator

from alembic import command
from alembic.config import Config
from core.config import DATABASE_URL, DEBUG

# Import all models to register them with SQLAlchemy
from models.db.admin_db_models import Admin  # noqa: F401
from models.db.album_db_models import Album  # noqa: F401
from models.db.file_hash_db_models import FileHash  # noqa: F401
from models.db.photo_db_models import Photo  # noqa: F401
from models.db.share_link_db_models import ShareLink  # noqa: F401
from sqlalchemy import create_engine, inspect
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

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


def run_migrations() -> None:
    """Run Alembic migrations programmatically."""
    # Get the directory where alembic.ini is located
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # Convert async URL to sync URL for Alembic
    sync_url = DATABASE_URL.replace("+asyncpg", "")

    alembic_cfg = Config(os.path.join(base_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(base_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", sync_url)

    # Check if this is an existing database that needs stamping
    engine = create_engine(sync_url)
    with engine.connect() as conn:
        inspector = inspect(conn)
        tables = inspector.get_table_names()

        # If tables exist but alembic_version doesn't, stamp the database
        if "admins" in tables and "alembic_version" not in tables:
            print("⚠️  Existing database detected, stamping with current migration...")
            command.stamp(alembic_cfg, "001")
            print("✓ Database stamped with migration 001")
            engine.dispose()
            return

    engine.dispose()

    print("🔄 Running database migrations...")
    command.upgrade(alembic_cfg, "head")
    print("✓ Database migrations complete")


async def init_db() -> None:
    """Initialize database by running migrations."""
    # Run Alembic migrations (handles both new and existing databases)
    run_migrations()
