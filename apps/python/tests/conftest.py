"""Shared test fixtures for pytest."""

import asyncio
import os
import uuid
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

# Determine test database URL
# Use PostgreSQL if DATABASE_URL is set (CI), otherwise fall back to SQLite (local dev)
TEST_DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite+aiosqlite:///:memory:"
)

# Set environment variables before importing app (only if not already set)
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
if "JWT_SECRET" not in os.environ:
    os.environ["JWT_SECRET"] = "test-secret-key-for-testing-only"
if "ALLOWED_ORIGINS" not in os.environ:
    os.environ["ALLOWED_ORIGINS"] = "http://localhost,http://testserver"

# ruff: noqa: E402
# Imports must happen after setting environment variables
from core.database import get_db
from core.rate_limit import limiter
from main import app
from models.db.admin_db_models import Admin
from models.db.base import Base
from utils.security_util import hash_password

# Create test database engine
# Use NullPool for PostgreSQL to avoid connection issues in tests
engine_kwargs = {"echo": False}
if "postgresql" in TEST_DATABASE_URL:
    engine_kwargs["poolclass"] = NullPool

test_engine = create_async_engine(TEST_DATABASE_URL, **engine_kwargs)
TestSessionLocal = sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with database override."""

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Disable rate limiter for tests
    limiter.enabled = False

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_admin(db_session: AsyncSession) -> Admin:
    """Create a test admin user."""
    admin = Admin(
        id=uuid.uuid4(),
        email="test@example.com",
        password_hash=hash_password("testpassword123"),
        name="Test Admin",
        is_owner=True,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


@pytest_asyncio.fixture
async def auth_headers(client: AsyncClient, test_admin: Admin) -> dict[str, str]:
    """Get authentication headers for a test admin."""
    response = await client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "testpassword123"},
    )
    data = response.json()
    return {"Authorization": f"Bearer {data['access_token']}"}
