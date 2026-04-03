"""
Unit tests for DeltaEngine: jitter filtering and Haversine distance checks.
"""

import json
import pytest
from unittest.mock import AsyncMock

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from delta_engine import DeltaEngine, MedialClause


def _make_clause(lat: float, lon: float, uid: str = "TEST-1") -> MedialClause:
    return MedialClause(
        uid=uid,
        time=1_700_000_000,
        source="TAK_ADSB",
        predicate_type="a-f-A-C-F",
        lat=lat,
        lon=lon,
        hae=100.0,
        adverbial_context={"speed": 50.0, "course": 90.0},
    )


# ---------------------------------------------------------------------------
# MedialClause serialisation round-trip
# ---------------------------------------------------------------------------

class TestMedialClause:
    def test_to_dict_from_dict_roundtrip(self):
        clause = _make_clause(51.5, -0.12)
        restored = MedialClause.from_dict(clause.to_dict())

        assert restored.uid == clause.uid
        assert restored.lat == clause.lat
        assert restored.lon == clause.lon
        assert restored.predicate_type == clause.predicate_type
        assert restored.adverbial_context == clause.adverbial_context

    def test_from_dict_missing_optional_fields(self):
        """from_dict should handle missing optional keys gracefully."""
        data = {
            "uid": "X",
            "time": 0,
            "source": "TAK_AIS",
            "predicate_type": "a-f-S-M",
            "lat": 10.0,
            "lon": 20.0,
            "hae": 0.0,
        }
        clause = MedialClause.from_dict(data)
        assert clause.adverbial_context == {}
        assert clause.state_change_reason is None


# ---------------------------------------------------------------------------
# DeltaEngine.should_filter_as_jitter
# ---------------------------------------------------------------------------

class TestJitterFilter:
    def setup_method(self):
        self.engine = DeltaEngine("redis://localhost:6379")

    def test_no_previous_state_passes_through(self):
        """First observation always passes (no baseline)."""
        assert not self.engine.should_filter_as_jitter("UID", 51.0, 0.0, None)

    def test_identical_position_is_jitter(self):
        """Identical position (0 m distance) must be filtered."""
        prev = _make_clause(51.5, -0.12)
        assert self.engine.should_filter_as_jitter("UID", 51.5, -0.12, prev)

    def test_movement_under_bypass_threshold_is_jitter(self):
        """Movement < SPATIAL_BYPASS_M (100 m) with ce=le=0 is filtered."""
        prev = _make_clause(51.5000, -0.1200)
        # ~55 m north
        assert self.engine.should_filter_as_jitter("UID", 51.5005, -0.1200, prev)

    def test_movement_over_bypass_threshold_passes(self):
        """Movement > SPATIAL_BYPASS_M passes through when ce=le=0."""
        prev = _make_clause(51.5000, -0.1200)
        # ~1.1 km north
        assert not self.engine.should_filter_as_jitter("UID", 51.5100, -0.1200, prev)

    def test_ce_le_expands_error_bound(self):
        """When ce+le > SPATIAL_BYPASS_M, larger movements can still be jitter."""
        prev = _make_clause(51.5000, -0.1200)
        # ~110 m movement – normally passes, but with ce=200 it's within error
        assert self.engine.should_filter_as_jitter(
            "UID", 51.5010, -0.1200, prev, ce=200.0, le=0.0
        )

    def test_small_ce_le_still_enforces_bypass_minimum(self):
        """ce+le < SPATIAL_BYPASS_M: minimum threshold still applies."""
        prev = _make_clause(51.5000, -0.1200)
        # 10 m movement, ce=5, le=5 → error_bound = max(10, 100) = 100
        # distance ≈ 0 m → filtered
        assert self.engine.should_filter_as_jitter(
            "UID", 51.5000, -0.1200, prev, ce=5.0, le=5.0
        )


# ---------------------------------------------------------------------------
# DeltaEngine.cache_medial_clause / get_previous_state (async, mocked Redis)
# ---------------------------------------------------------------------------

class TestRedisCache:
    @pytest.mark.asyncio
    async def test_cache_and_retrieve(self):
        engine = DeltaEngine("redis://localhost:6379")
        clause = _make_clause(51.5, -0.12, uid="CACHE-TEST")

        mock_redis = AsyncMock()
        # Simulate Redis returning serialised clause
        mock_redis.get.return_value = json.dumps(clause.to_dict())
        engine.redis_client = mock_redis

        await engine.cache_medial_clause(clause)
        mock_redis.set.assert_called_once()

        retrieved = await engine.get_previous_state("CACHE-TEST")
        assert retrieved is not None
        assert retrieved.uid == "CACHE-TEST"
        assert retrieved.lat == 51.5

    @pytest.mark.asyncio
    async def test_get_previous_state_returns_none_on_miss(self):
        engine = DeltaEngine("redis://localhost:6379")
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None
        engine.redis_client = mock_redis

        result = await engine.get_previous_state("UNKNOWN-UID")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_previous_state_returns_none_without_client(self):
        engine = DeltaEngine("redis://localhost:6379")
        engine.redis_client = None
        assert await engine.get_previous_state("X") is None
