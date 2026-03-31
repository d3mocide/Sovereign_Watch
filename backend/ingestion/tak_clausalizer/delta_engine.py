"""
Delta Engine: Performs spatial-temporal filtering and state caching.
Queries Redis for previous state, calculates Haversine distance, filters GPS jitter.
"""

import json
import logging
import time
from typing import Any, Dict, Optional

import redis.asyncio as redis

from utils import haversine_m, safe_float

logger = logging.getLogger(__name__)


class MedialClause:
    """Represents a medial clause (state snapshot) for a TAK entity."""

    def __init__(
        self,
        uid: str,
        time: int,
        source: str,
        predicate_type: str,
        lat: float,
        lon: float,
        hae: float,
        adverbial_context: Dict[str, Any],
        state_change_reason: Optional[str] = None,
    ):
        self.uid = uid
        self.time = time
        self.source = source
        self.predicate_type = predicate_type
        self.lat = lat
        self.lon = lon
        self.hae = hae
        self.adverbial_context = adverbial_context
        self.state_change_reason = state_change_reason

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for Redis caching."""
        return {
            "uid": self.uid,
            "time": self.time,
            "source": self.source,
            "predicate_type": self.predicate_type,
            "lat": self.lat,
            "lon": self.lon,
            "hae": self.hae,
            "adverbial_context": self.adverbial_context,
            "state_change_reason": self.state_change_reason,
        }

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "MedialClause":
        """Deserialize from dictionary (from Redis)."""
        return MedialClause(
            uid=data["uid"],
            time=data["time"],
            source=data["source"],
            predicate_type=data["predicate_type"],
            lat=data["lat"],
            lon=data["lon"],
            hae=data["hae"],
            adverbial_context=data.get("adverbial_context", {}),
            state_change_reason=data.get("state_change_reason"),
        )


class DeltaEngine:
    """
    Evaluates incoming TAK messages for state changes.
    Implements jitter filtering via Haversine distance checks.
    Manages Redis cache of previous medial clauses.
    """

    # Thresholds for delta calculation
    TEMPORAL_GATE_S = 0.5  # Minimum elapsed source time
    SPATIAL_BYPASS_M = 100.0  # Spatial bypass threshold (meters)
    CACHE_TTL_S = 3600  # Redis cache TTL (1 hour)

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.redis_client: Optional[redis.Redis] = None

    async def connect(self):
        """Connect to Redis."""
        self.redis_client = await redis.from_url(
            self.redis_url, decode_responses=True
        )
        logger.info("DeltaEngine connected to Redis")

    async def disconnect(self):
        """Disconnect from Redis."""
        if self.redis_client:
            await self.redis_client.close()

    async def get_previous_state(self, uid: str) -> Optional[MedialClause]:
        """
        Query Redis for the previous medial clause.
        Returns None if not cached.
        """
        if not self.redis_client:
            return None

        try:
            key = f"clausal:state:{uid}"
            data = await self.redis_client.get(key)
            if data:
                clause_dict = json.loads(data)
                return MedialClause.from_dict(clause_dict)
        except Exception as e:
            logger.warning(f"Error retrieving previous state for {uid}: {e}")

        return None

    def should_filter_as_jitter(
        self,
        uid: str,
        new_lat: float,
        new_lon: float,
        prev_clause: Optional[MedialClause],
        ce: float = 0.0,
        le: float = 0.0,
    ) -> bool:
        """
        Jitter filtering: Compare new position against previous state.
        If Haversine distance < (ce + le), classify as GPS jitter and FILTER OUT.

        Args:
            uid: Entity identifier
            new_lat, new_lon: New position
            prev_clause: Previous cached medial clause
            ce: Circular Error (meters) from TAK message
            le: Linear Error (meters) from TAK message

        Returns:
            True if should be filtered (jitter), False if should pass
        """
        if prev_clause is None:
            # No previous state: allow through
            return False

        # Calculate Haversine distance
        distance_m = haversine_m(prev_clause.lat, prev_clause.lon, new_lat, new_lon)

        # GPS error bound
        error_bound = ce + le

        # If distance < error_bound, it's within GPS uncertainty → jitter
        if distance_m < error_bound:
            logger.debug(
                f"Jitter filtered {uid}: distance={distance_m:.1f}m < bound={error_bound:.1f}m"
            )
            return True

        return False

    async def cache_medial_clause(self, clause: MedialClause):
        """Cache medial clause in Redis with TTL."""
        if not self.redis_client:
            return

        try:
            key = f"clausal:state:{clause.uid}"
            data = json.dumps(clause.to_dict())
            await self.redis_client.set(key, data, ex=self.CACHE_TTL_S)
        except Exception as e:
            logger.error(f"Error caching medial clause for {clause.uid}: {e}")

    async def cleanup_stale_entries(self):
        """Periodic cleanup of Redis entries (TTL is handled by Redis)."""
        # Redis TTL handles automatic expiration
        # This method can be used for monitoring/stats if needed
        pass
