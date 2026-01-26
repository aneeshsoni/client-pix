"""Tests for health check endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Test that health endpoint returns healthy status."""
    response = await client.get("/api/system/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "message" in data


@pytest.mark.asyncio
async def test_api_docs_accessible(client: AsyncClient):
    """Test that API docs endpoint is accessible."""
    response = await client.get("/docs")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_openapi_json_accessible(client: AsyncClient):
    """Test that OpenAPI JSON is accessible."""
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert "openapi" in data
    assert "paths" in data
