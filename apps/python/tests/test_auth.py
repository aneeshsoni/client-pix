"""Tests for authentication endpoints."""

import pytest
from httpx import AsyncClient
from models.db.admin_db_models import Admin


@pytest.mark.asyncio
async def test_setup_status_no_admins(client: AsyncClient):
    """Test setup status when no admins exist."""
    response = await client.get("/api/auth/setup-status")
    assert response.status_code == 200
    data = response.json()
    assert data["needs_setup"] is True


@pytest.mark.asyncio
async def test_setup_status_with_admin(client: AsyncClient, test_admin: Admin):
    """Test setup status when admin exists."""
    response = await client.get("/api/auth/setup-status")
    assert response.status_code == 200
    data = response.json()
    assert data["needs_setup"] is False


@pytest.mark.asyncio
async def test_register_first_admin(client: AsyncClient):
    """Test registering the first admin."""
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "admin@example.com",
            "password": "securepassword123",
            "name": "Admin User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_password_too_short(client: AsyncClient):
    """Test registration with password that's too short."""
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "admin@example.com",
            "password": "short",  # Less than 8 characters
            "name": "Admin User",
        },
    )
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_register_second_admin_blocked(client: AsyncClient, test_admin: Admin):
    """Test that second admin registration is blocked."""
    response = await client.post(
        "/api/auth/register",
        json={
            "email": "admin2@example.com",
            "password": "securepassword123",
            "name": "Second Admin",
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_admin: Admin):
    """Test successful login."""
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_admin: Admin):
    """Test login with wrong password."""
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "wrongpassword",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_wrong_email(client: AsyncClient, test_admin: Admin):
    """Test login with non-existent email."""
    response = await client.post(
        "/api/auth/login",
        json={
            "email": "nonexistent@example.com",
            "password": "testpassword123",
        },
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user(client: AsyncClient, auth_headers: dict[str, str]):
    """Test getting current user info."""
    response = await client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test Admin"
    assert data["is_owner"] is True


@pytest.mark.asyncio
async def test_get_current_user_unauthorized(client: AsyncClient):
    """Test getting current user without auth."""
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_invalid_token(client: AsyncClient):
    """Test getting current user with invalid token."""
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalid_token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, test_admin: Admin):
    """Test token refresh."""
    # First login to get tokens
    login_response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpassword123",
        },
    )
    login_data = login_response.json()
    refresh_token = login_data["refresh_token"]

    # Use refresh token to get new tokens
    response = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient):
    """Test refresh with invalid token."""
    response = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": "invalid_refresh_token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_change_password(
    client: AsyncClient, auth_headers: dict[str, str], test_admin: Admin
):
    """Test changing password."""
    response = await client.post(
        "/api/auth/change-password",
        headers=auth_headers,
        json={
            "current_password": "testpassword123",
            "new_password": "newpassword456",
        },
    )
    assert response.status_code == 200

    # Verify can login with new password
    login_response = await client.post(
        "/api/auth/login",
        json={
            "email": "test@example.com",
            "password": "newpassword456",
        },
    )
    assert login_response.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current(
    client: AsyncClient, auth_headers: dict[str, str]
):
    """Test changing password with wrong current password."""
    response = await client.post(
        "/api/auth/change-password",
        headers=auth_headers,
        json={
            "current_password": "wrongpassword",
            "new_password": "newpassword456",
        },
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_change_password_new_too_short(
    client: AsyncClient, auth_headers: dict[str, str]
):
    """Test changing password with new password too short."""
    response = await client.post(
        "/api/auth/change-password",
        headers=auth_headers,
        json={
            "current_password": "testpassword123",
            "new_password": "short",  # Less than 8 characters
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_profile(client: AsyncClient, auth_headers: dict[str, str]):
    """Test updating profile."""
    response = await client.patch(
        "/api/auth/me",
        headers=auth_headers,
        json={"name": "Updated Name"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, auth_headers: dict[str, str]):
    """Test logout endpoint."""
    response = await client.post("/api/auth/logout", headers=auth_headers)
    assert response.status_code == 200
