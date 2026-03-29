"""
Authentication & user-management router.

Public endpoints:
  POST /api/auth/login          — exchange credentials for a JWT
  POST /api/auth/first-setup    — bootstrap the first admin (only when user table is empty)

Authenticated endpoints:
  GET  /api/auth/me             — current user profile
  POST /api/auth/logout         — client-side token discard (informational 200)

Admin-only endpoints:
  GET    /api/auth/users           — list all users
  POST   /api/auth/users           — create a user
  GET    /api/auth/users/{user_id} — get a specific user
  PATCH  /api/auth/users/{user_id} — update role / active-state / password
  DELETE /api/auth/users/{user_id} — deactivate (soft-delete) a user
"""

from __future__ import annotations

import logging

from core.auth import (
    create_access_token,
    get_current_user,
    get_user_by_id,
    get_user_by_username,
    hash_password,
    require_role,
    verify_password,
)
from core.database import db
from fastapi import APIRouter, Depends, HTTPException, status
from models.user import (
    FirstSetupRequest,
    LoginRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("SovereignWatch.Auth")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _user_count() -> int:
    """Return the total number of user rows."""
    if not db.pool:
        return 0
    async with db.pool.acquire() as conn:
        return await conn.fetchval("SELECT COUNT(*) FROM users")


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


@router.post("/login", response_model=TokenResponse, summary="Obtain a JWT access token")
async def login(body: LoginRequest):
    """Authenticate with username + password; returns a Bearer token."""
    user = await get_user_by_username(body.username)
    if user is None or not verify_password(body.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        )
    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    logger.info("User '%s' authenticated successfully", body.username)
    return TokenResponse(access_token=token)


@router.post(
    "/first-setup",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Bootstrap the first admin account",
)
async def first_setup(body: FirstSetupRequest):
    """
    Creates the initial admin user.  Only succeeds when the users table is
    completely empty — subsequent calls return 409.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not available")

    count = await _user_count()
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Users already exist. Use /api/auth/login instead.",
        )

    hashed = hash_password(body.password)
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO users (username, hashed_password, role, is_active) "
            "VALUES ($1, $2, 'admin', TRUE) RETURNING id, username, role, is_active",
            body.username,
            hashed,
        )
    logger.info("First admin account '%s' created via first-setup", body.username)
    return UserResponse(**dict(row))


# ---------------------------------------------------------------------------
# Authenticated endpoints
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse, summary="Current user profile")
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        username=current_user["username"],
        role=current_user["role"],
        is_active=current_user["is_active"],
    )


@router.post("/logout", summary="Logout (client-side token discard)")
async def logout(_current_user: dict = Depends(get_current_user)):
    """
    JWTs are stateless.  This endpoint exists so the client can call a
    dedicated URL and then discard the token locally.  Server-side blocklisting
    can be added here later if needed.
    """
    return {"detail": "Logged out. Discard your token."}


# ---------------------------------------------------------------------------
# Admin-only user management
# ---------------------------------------------------------------------------


@router.get(
    "/users",
    response_model=list[UserResponse],
    summary="List all users",
    dependencies=[Depends(require_role("admin"))],
)
async def list_users():
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not available")
    async with db.pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, username, role, is_active FROM users ORDER BY id"
        )
    return [UserResponse(**dict(r)) for r in rows]


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user",
    dependencies=[Depends(require_role("admin"))],
)
async def create_user(body: UserCreate):
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not available")

    existing = await get_user_by_username(body.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{body.username}' is already taken",
        )

    hashed = hash_password(body.password)
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO users (username, hashed_password, role, is_active) "
            "VALUES ($1, $2, $3, TRUE) RETURNING id, username, role, is_active",
            body.username,
            hashed,
            body.role,
        )
    logger.info("Admin created user '%s' with role '%s'", body.username, body.role)
    return UserResponse(**dict(row))


@router.get(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Get a specific user",
    dependencies=[Depends(require_role("admin"))],
)
async def get_user(user_id: int):
    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)


@router.patch(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Update a user's role, active status, or password",
    dependencies=[Depends(require_role("admin"))],
)
async def update_user(user_id: int, body: UserUpdate):
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not available")

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates: list[str] = []
    params: list = []
    param_idx = 1

    if body.role is not None:
        updates.append(f"role = ${param_idx}")
        params.append(body.role)
        param_idx += 1

    if body.is_active is not None:
        updates.append(f"is_active = ${param_idx}")
        params.append(body.is_active)
        param_idx += 1

    if body.password is not None:
        updates.append(f"hashed_password = ${param_idx}")
        params.append(hash_password(body.password))
        param_idx += 1

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    params.append(user_id)
    query = (
        f"UPDATE users SET {', '.join(updates)} "
        f"WHERE id = ${param_idx} "
        "RETURNING id, username, role, is_active"
    )
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(query, *params)

    logger.info("Admin updated user id=%s: %s", user_id, body.model_dump(exclude_none=True))
    return UserResponse(**dict(row))


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate (soft-delete) a user",
    dependencies=[Depends(require_role("admin"))],
)
async def deactivate_user(
    user_id: int,
    current_user: dict = Depends(require_role("admin")),
):
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not available")

    if current_user["id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot deactivate their own account",
        )

    user = await get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    async with db.pool.acquire() as conn:
        await conn.execute(
            "UPDATE users SET is_active = FALSE WHERE id = $1", user_id
        )
    logger.info("Admin deactivated user id=%s", user_id)
