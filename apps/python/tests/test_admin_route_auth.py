"""Tests for admin route authentication boundaries."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_album_routes_require_auth(client: AsyncClient):
    response = await client.get("/api/albums")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"


@pytest.mark.asyncio
async def test_album_routes_allow_auth(
    client: AsyncClient,
    auth_headers: dict[str, str],
):
    response = await client.get("/api/albums", headers=auth_headers)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_system_storage_routes_require_auth(client: AsyncClient):
    response = await client.get("/api/system/storage")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"


@pytest.mark.asyncio
async def test_health_route_remains_public(client: AsyncClient):
    response = await client.get("/api/system/health")

    assert response.status_code == 200
