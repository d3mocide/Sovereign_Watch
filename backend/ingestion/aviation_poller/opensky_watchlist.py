"""
Redis-backed ICAO24 watchlist for OpenSky global aircraft tracking.

Schema
------
Redis ZSET  key: opensky:watchlist
  member : icao24 hex string (lowercase)
  score  : expiry Unix timestamp  (PERMANENT_SCORE = year 3000 → never removed)

Operations:
  add(icao24, ttl_seconds)  → ZADD score=(now+ttl or PERMANENT) member=icao24
  remove(icao24)            → ZREM
  get_active()              → ZRANGEBYSCORE now +inf  (skips expired entries)
  cleanup_expired()         → ZREMRANGEBYSCORE -inf (now-1)

Why ZSET / score-as-expiry
  - O(log N) add/remove
  - O(log N + M) range-read of M active entries
  - Expired entries are lazily skipped by get_active() and eagerly removed
    by cleanup_expired() which is called from the service cleanup_loop()
  - No Lua scripts or MULTI/EXEC needed
"""

import logging
import time
from typing import List, Optional

import redis.asyncio as redis

logger = logging.getLogger("opensky_watchlist")

_WATCHLIST_KEY = "opensky:watchlist"
# Score used for entries that should never expire (01-Jan-3000 00:00:00 UTC)
_PERMANENT_SCORE: float = 32_503_680_000.0
# Sentinel: caller did not supply a TTL → use instance default
_USE_DEFAULT = object()


class WatchlistManager:
    """
    Manages the ICAO24 global-tracking watchlist backed by Redis.

    Parameters
    ----------
    redis_url:
        Redis connection URL, e.g. ``redis://sovereign-redis:6379``.
    default_ttl_seconds:
        TTL applied to ``add()`` calls that don't supply their own TTL.
        ``None`` → permanent (score = PERMANENT_SCORE).
    """

    def __init__(
        self,
        redis_url: str,
        default_ttl_seconds: Optional[float] = None,
    ):
        self._redis_url = redis_url
        self.default_ttl_seconds = default_ttl_seconds
        self._client: Optional[redis.Redis] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> None:
        self._client = await redis.from_url(self._redis_url, decode_responses=True)
        count = await self._client.zcard(_WATCHLIST_KEY)
        logger.info(
            "WatchlistManager ready — %d entries, default_ttl=%s",
            count,
            f"{self.default_ttl_seconds:.0f}s" if self.default_ttl_seconds else "permanent",
        )

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _expiry_score(self, ttl_seconds: Optional[float]) -> float:
        """Convert a TTL (or None → permanent) to a Redis score."""
        if ttl_seconds is None:
            return _PERMANENT_SCORE
        return time.time() + ttl_seconds

    # ------------------------------------------------------------------
    # Write API
    # ------------------------------------------------------------------
    async def add(
        self,
        icao24: str,
        ttl_seconds: object = _USE_DEFAULT,
    ) -> None:
        """
        Add or refresh an ICAO24 entry.

        ``ttl_seconds`` behaviour:
          - Omitted / _USE_DEFAULT → apply ``default_ttl_seconds``
          - ``None``               → permanent (score = _PERMANENT_SCORE)
          - ``float``              → expire in that many seconds from now
        """
        if not self._client:
            return
        effective_ttl = (
            self.default_ttl_seconds if ttl_seconds is _USE_DEFAULT else ttl_seconds
        )
        score = self._expiry_score(effective_ttl)
        await self._client.zadd(_WATCHLIST_KEY, {icao24.lower(): score})

    async def add_permanent(self, icao24: str) -> None:
        """Add an entry that never expires (manual watchlist entries)."""
        await self.add(icao24, ttl_seconds=None)

    async def remove(self, icao24: str) -> None:
        """Remove an ICAO24 from the watchlist."""
        if not self._client:
            return
        await self._client.zrem(_WATCHLIST_KEY, icao24.lower())

    # ------------------------------------------------------------------
    # Read API
    # ------------------------------------------------------------------
    async def get_active(self) -> List[str]:
        """
        Return all non-expired ICAO24s.

        Entries whose score (expiry timestamp) is < now are skipped.
        Entries with score == PERMANENT_SCORE are always returned.
        """
        if not self._client:
            return []
        now = time.time()
        # ZRANGEBYSCORE returns members with score in [now, +inf]
        # This naturally skips expired entries (score < now) while including
        # permanent entries (score == PERMANENT_SCORE >> now).
        return await self._client.zrangebyscore(_WATCHLIST_KEY, now, "+inf")

    async def size(self) -> int:
        """Total entry count (including expired entries not yet cleaned up)."""
        if not self._client:
            return 0
        return await self._client.zcard(_WATCHLIST_KEY)

    async def contains(self, icao24: str) -> bool:
        """Return True if icao24 is present and not expired."""
        if not self._client:
            return False
        score = await self._client.zscore(_WATCHLIST_KEY, icao24.lower())
        if score is None:
            return False
        return score >= time.time()

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------
    async def cleanup_expired(self) -> int:
        """
        Remove expired entries from the ZSET.

        Called periodically by service.cleanup_loop() so memory doesn't grow
        unboundedly when many aircraft are auto-seeded and their TTLs lapse.

        Returns the number of entries removed.
        """
        if not self._client:
            return 0
        now = time.time()
        # Members with score < now have already expired
        removed = await self._client.zremrangebyscore(_WATCHLIST_KEY, "-inf", now - 1)
        if removed:
            logger.info("Watchlist: evicted %d expired entries", removed)
        return removed
