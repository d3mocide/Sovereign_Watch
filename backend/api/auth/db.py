import asyncpg
from typing import Optional, Tuple
from .models import User

async def get_user_by_username(pool: asyncpg.Pool, username: str) -> Optional[Tuple[User, str]]:
    """
    Look up a user by username.
    Returns a tuple of (User model, raw_password_hash) if found, else None.
    Does NOT include the password hash in the User model.
    """
    query = """
        SELECT id, username, roles, password_hash, is_active
        FROM sw_users
        WHERE username = $1 AND is_active = TRUE
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(query, username)

    if row:
        user = User(
            id=str(row['id']),
            username=row['username'],
            roles=row['roles'] or []
        )
        return user, row['password_hash']
    return None

async def update_last_login(pool: asyncpg.Pool, user_id: str) -> None:
    """
    Update the last_login timestamp for a given user.
    """
    query = """
        UPDATE sw_users
        SET last_login = NOW()
        WHERE id = $1::uuid
    """
    async with pool.acquire() as conn:
        await conn.execute(query, user_id)
