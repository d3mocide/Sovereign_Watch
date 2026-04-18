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
from fastapi import Depends, HTTPException, status, WebSocket
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

def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# Rate limiting (Redis-backed, fail-open)
# ---------------------------------------------------------------------------


async def check_rate_limit(identifier: str, limit: int = 10, window: int = 60) -> None:
    """
    Increment a Redis fixed-window counter keyed by `identifier`.
    Raises HTTP 429 if more than `limit` calls occur within `window` seconds.
    Silently no-ops when Redis is unavailable so auth is never blocked by a
    cache outage.
    """
    if not db.redis_client:
        return
    key = f"ratelimit:{identifier}"
    try:
        pipe = db.redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        results = await pipe.execute()
        count = results[0]
    except Exception:
        return  # fail-open on Redis errors
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Try again later.",
            headers={"Retry-After": str(window)},
        )


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
    return jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )


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
            "SELECT id, username, hashed_password, role, is_active, "
            "created_at, password_version "
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
            "SELECT id, username, hashed_password, role, is_active, "
            "created_at, password_version "
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


async def authenticate_token(token: str) -> dict[str, Any]:
    """
    Decodes a JWT token, fetches the user, and validates activity and version.
    Used by both HTTP and WebSocket auth paths.
    """
    payload = _decode_token(token)
    user_id_str: str | None = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = int(user_id_str)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await get_user_by_id(user_id)
    if user is None or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify the password-version claim matches the DB.  A mismatch means the
    # password was changed after this token was issued — force re-login.
    if payload.get("pwv", 0) != user.get("password_version", 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalidated — please log in again",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
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

    return await authenticate_token(credentials.credentials)


async def authenticate_websocket(
    websocket: WebSocket, token: str | None
) -> dict[str, Any] | None:
    """
    Authenticates a WebSocket connection using a query-param token.
    Accepts the connection first so it can send a proper close code on failure.
    Returns the user dict if successful, or None (after closing) on failure.
    """
    await websocket.accept()

    if not settings.AUTH_ENABLED:
        return _ANON_USER

    if not token:
        await websocket.close(code=4001, reason="Authentication required")
        return None

    try:
        return await authenticate_token(token)
    except HTTPException as e:
        await websocket.close(code=4001, reason=e.detail)
        return None
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return None


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
        role = user.get("role", "viewer")
        role_index = ROLES.index(role) if role in ROLES else -1
        if role_index < min_index:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{minimum_role}' role or higher",
            )
        return user

    return _check
