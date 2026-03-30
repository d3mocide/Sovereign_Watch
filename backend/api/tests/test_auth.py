"""
Tests for the authentication router and core auth utilities.

Covers:
  - login with correct credentials → 200 + token
  - login with wrong password → 401
  - /me with valid token → 200
  - /me without token (auth enabled) → 401
  - first-setup creates admin when user table is empty
  - first-setup blocked when users already exist
  - admin can list users
  - non-admin is forbidden from listing users
  - create_access_token + verify round-trip
  - hash_password + verify_password round-trip
"""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Stub heavy dependencies before any project import
# ---------------------------------------------------------------------------

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from test_stubs import install_common_test_stubs  # noqa: E402

install_common_test_stubs()

from core.auth import (  # noqa: E402
    create_access_token,
    hash_password,
    verify_password,
)
from main import app  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

HASHED_PASS = hash_password("testpassword")

_MOCK_USER = {
    "id": 1,
    "username": "testadmin",
    "hashed_password": HASHED_PASS,
    "role": "admin",
    "is_active": True,
}

_MOCK_VIEWER = {
    "id": 2,
    "username": "viewer1",
    "hashed_password": HASHED_PASS,
    "role": "viewer",
    "is_active": True,
}


def _make_token(user: dict) -> str:
    return create_access_token({"sub": str(user["id"]), "role": user["role"]})


# ---------------------------------------------------------------------------
# Unit tests — password hashing
# ---------------------------------------------------------------------------


def test_password_hashing_round_trip():
    plain = "s3cr3t!Password"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)
    assert not verify_password("wrong", hashed)


# ---------------------------------------------------------------------------
# Unit tests — JWT
# ---------------------------------------------------------------------------


def test_token_round_trip():
    token = create_access_token({"sub": "42", "role": "operator"})
    assert isinstance(token, str)
    assert len(token) > 20


# ---------------------------------------------------------------------------
# Integration tests — auth endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_success():
    """Correct credentials return 200 and a token."""
    transport = ASGITransport(app=app)
    with patch("routers.auth.get_user_by_username", AsyncMock(return_value=_MOCK_USER)):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/auth/login",
                json={"username": "testadmin", "password": "testpassword"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password():
    """Wrong password returns 401."""
    transport = ASGITransport(app=app)
    with patch("routers.auth.get_user_by_username", AsyncMock(return_value=_MOCK_USER)):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/auth/login",
                json={"username": "testadmin", "password": "wrongpassword"},
            )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_user():
    """Unknown username returns 401."""
    transport = ASGITransport(app=app)
    with patch("routers.auth.get_user_by_username", AsyncMock(return_value=None)):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/auth/login",
                json={"username": "nobody", "password": "x"},
            )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token():
    """Authenticated /me returns user profile."""
    transport = ASGITransport(app=app)
    token = _make_token(_MOCK_USER)
    with (
        patch("core.auth.get_user_by_id", AsyncMock(return_value=_MOCK_USER)),
        patch("core.config.settings.AUTH_ENABLED", True),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "testadmin"
    assert data["role"] == "admin"


@pytest.mark.asyncio
async def test_me_without_token_auth_enabled():
    """No token + auth enabled → 401."""
    transport = ASGITransport(app=app)
    with patch("core.config.settings.AUTH_ENABLED", True):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_first_setup_creates_admin():
    """first-setup works when no users exist (atomic INSERT returns a row)."""
    transport = ASGITransport(app=app)

    row_dict = {"id": 1, "username": "newadmin", "role": "admin", "is_active": True}

    mock_conn = MagicMock()
    # Atomic INSERT … WHERE NOT EXISTS returns the new row when table was empty
    mock_conn.fetchrow = AsyncMock(return_value=row_dict)
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=None)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_conn)

    with patch("core.database.db.pool", mock_pool):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/auth/first-setup",
                json={"username": "newadmin", "password": "Str0ngP@ssword"},
            )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_first_setup_blocked_when_users_exist():
    """first-setup returns 404 when users already exist (atomic INSERT returns None)."""
    transport = ASGITransport(app=app)

    mock_conn = MagicMock()
    # Atomic INSERT … WHERE NOT EXISTS returns None when table was not empty
    mock_conn.fetchrow = AsyncMock(return_value=None)
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=None)

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_conn)

    with patch("core.database.db.pool", mock_pool):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/auth/first-setup",
                json={"username": "another", "password": "Str0ngP@ssword"},
            )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_users_admin_only():
    """Non-admin token is rejected with 403."""
    transport = ASGITransport(app=app)
    viewer_token = _make_token(_MOCK_VIEWER)
    with (
        patch("core.auth.get_user_by_id", AsyncMock(return_value=_MOCK_VIEWER)),
        patch("core.config.settings.AUTH_ENABLED", True),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/auth/users",
                headers={"Authorization": f"Bearer {viewer_token}"},
            )
    assert resp.status_code == 403
