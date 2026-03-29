"""
Authentication utilities for Sovereign Watch.

Provides:
  - JWT access-token creation/verification
  - Password hashing/verification via bcrypt
  - FastAPI dependency `get_current_user` that validates Bearer tokens
  - FastAPI dependency `require_role` factory for role-based access control
  - `optional_auth` — passes through when AUTH_ENABLED=false (local dev)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from core.config import settings
from core.database import db
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

logger = logging.getLogger("SovereignWatch.Auth")

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Roles in ascending order of privilege
ROLES = ("viewer", "operator", "admin")

_bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def create_access_token(data: dict[str, Any]) -> str:
    """Return a signed JWT access token."""
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT, raising HTTPException on any failure."""
    try:
        return jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


async def get_user_by_username(username: str) -> dict[str, Any] | None:
    """Fetch a user record from the database by username."""
    if not db.pool:
        return None
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, hashed_password, role, is_active "
            "FROM users WHERE username = $1",
            username,
        )
    return dict(row) if row else None


async def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    """Fetch a user record from the database by primary key."""
    if not db.pool:
        return None
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, username, hashed_password, role, is_active "
            "FROM users WHERE id = $1",
            user_id,
        )
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

# Sentinel returned when auth is disabled
_ANON_USER = {
    "id": 0,
    "username": "anonymous",
    "role": "admin",
    "is_active": True,
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """
    Validate the Bearer token and return the authenticated user dict.
    When AUTH_ENABLED=false all requests are treated as an admin (dev mode).
    """
    if not settings.AUTH_ENABLED:
        return _ANON_USER

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_token(credentials.credentials)
    user_id: int | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await get_user_by_id(int(user_id))
    if user is None or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_role(minimum_role: str):
    """
    Dependency factory.  Returns a FastAPI dependency that enforces a minimum
    role level.  Usage::

        @router.delete("/users/{uid}", dependencies=[Depends(require_role("admin"))])
    """
    if minimum_role not in ROLES:
        raise ValueError(f"Unknown role '{minimum_role}'. Must be one of {ROLES}.")

    min_index = ROLES.index(minimum_role)

    async def _check(user: dict = Depends(get_current_user)):
        role_index = ROLES.index(user.get("role", "viewer"))
        if role_index < min_index:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{minimum_role}' role or higher",
            )
        return user

    return _check
