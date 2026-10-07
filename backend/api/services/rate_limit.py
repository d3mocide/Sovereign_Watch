"""Atomic per-user limits for shared configuration writes behind a proxy."""

import logging

from fastapi import HTTPException

from core.database import db

logger = logging.getLogger("SovereignWatch.RateLimit")

_FIXED_WINDOW = """
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end
return {count, ttl}
"""


async def check_write_rate_limit(
    operation: str, user: dict, *, limit: int = 20, window: int = 60
) -> None:
    """Keep users independent; fail open if the limiter's Redis call fails.

    The script sets expiry atomically and repairs counters without a TTL.
    Rejected writes do not extend the fixed window.
    """
    if db.redis_client is None:
        return
    key = f"rate_limit:{operation}:user:{user['id']}"
    try:
        count, ttl = await db.redis_client.eval(_FIXED_WINDOW, 1, key, window)
        count, ttl = int(count), max(1, int(ttl))
    except Exception:
        logger.warning("Write limiter unavailable for %s", operation, exc_info=True)
        return
    if count > limit:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please try again later.",
            headers={"Retry-After": str(ttl)},
        )
