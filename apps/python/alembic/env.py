"""
Alembic Environment Configuration
=================================
Configures Alembic to work with SQLAlchemy and our models.
Uses synchronous psycopg2 for migrations (more reliable than async).
"""

from logging.config import fileConfig

from sqlalchemy import pool, create_engine
from sqlalchemy.engine import Connection

from alembic import context

# Import our models and config
from models.db.base import Base

# Import all models to register them with SQLAlchemy metadata
from models.db.admin_db_models import Admin  # noqa: F401
from models.db.album_db_models import Album  # noqa: F401
from models.db.file_hash_db_models import FileHash  # noqa: F401
from models.db.photo_db_models import Photo  # noqa: F401
from models.db.share_link_db_models import ShareLink  # noqa: F401

# Alembic Config object
config = context.config

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate support
target_metadata = Base.metadata


def get_url() -> str:
    """Get the database URL, converting async to sync if needed."""
    url = config.get_main_option("sqlalchemy.url")
    # Convert async driver to sync driver for migrations
    if url and "+asyncpg" in url:
        url = url.replace("+asyncpg", "")
    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine,
    though an Engine is acceptable here as well. By skipping the Engine
    creation we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with a connection."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with sync engine."""
    connectable = create_engine(
        get_url(),
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)

    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
