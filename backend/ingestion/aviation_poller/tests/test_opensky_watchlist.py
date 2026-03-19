"""
Unit tests for opensky_watchlist.py and the fetch_icao_list() integration.

WatchlistManager tests use a mock Redis client to avoid requiring a live
Redis instance.  The Redis commands used (zadd, zrem, zcard, zrangebyscore,
zremrangebyscore, zscore) are mocked individually.

fetch_icao_list() tests use the same mock-limiter pattern as
test_opensky_client.py.
"""
import sys
import time
from typing import List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# opensky_watchlist.py imports redis.asyncio, which is not installed in the
# host test environment.  Stub it before importing the module under test.
if "redis" not in sys.modules:
    _redis_stub = MagicMock(name="redis")
    _redis_stub.asyncio = MagicMock(name="redis.asyncio")
    sys.modules["redis"] = _redis_stub
    sys.modules["redis.asyncio"] = _redis_stub.asyncio

from opensky_client import OpenSkyClient  # noqa: E402
from opensky_watchlist import WatchlistManager, _PERMANENT_SCORE, _WATCHLIST_KEY  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_sv(
    icao24="ae1234",
    callsign="USAF1  ",
    latitude=50.0,
    longitude=10.0,
    baro_altitude=8_000.0,
    on_ground=False,
    velocity=200.0,
    true_track=45.0,
    vertical_rate=0.0,
    geo_altitude=8_100.0,
) -> List:
    return [
        icao24, callsign, "United States",
        1_700_000_000, 1_700_000_001,
        longitude, latitude,
        baro_altitude, on_ground,
        velocity, true_track, vertical_rate,
        None, geo_altitude,
        "7700", False, 0,
    ]


def _make_mock_redis() -> MagicMock:
    """Return a mock that covers the Redis commands used by WatchlistManager."""
    mock = AsyncMock()
    mock.zadd = AsyncMock(return_value=1)
    mock.zrem = AsyncMock(return_value=1)
    mock.zcard = AsyncMock(return_value=0)
    mock.zrangebyscore = AsyncMock(return_value=[])
    mock.zremrangebyscore = AsyncMock(return_value=0)
    mock.zscore = AsyncMock(return_value=None)
    mock.aclose = AsyncMock()
    return mock


def _make_mock_limiter():
    limiter = AsyncMock()
    limiter.__aenter__ = AsyncMock(return_value=None)
    limiter.__aexit__ = AsyncMock(return_value=False)
    return limiter


# ---------------------------------------------------------------------------
# WatchlistManager — lifecycle
# ---------------------------------------------------------------------------
class TestWatchlistManagerLifecycle:
    @pytest.mark.asyncio
    async def test_start_logs_entry_count(self):
        manager = WatchlistManager("redis://fake:6379", default_ttl_seconds=60.0)
        mock_redis = _make_mock_redis()
        mock_redis.zcard = AsyncMock(return_value=42)

        with patch("opensky_watchlist.redis") as mock_redis_module:
            mock_redis_module.from_url = AsyncMock(return_value=mock_redis)
            await manager.start()

        mock_redis.zcard.assert_awaited_once_with(_WATCHLIST_KEY)

    @pytest.mark.asyncio
    async def test_close_calls_aclose(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        manager._client = mock_redis

        await manager.close()
        mock_redis.aclose.assert_awaited_once()
        assert manager._client is None


# ---------------------------------------------------------------------------
# WatchlistManager — add / remove / contains
# ---------------------------------------------------------------------------
class TestWatchlistManagerWrite:
    @pytest.mark.asyncio
    async def test_add_uses_default_ttl(self):
        manager = WatchlistManager("redis://fake:6379", default_ttl_seconds=3600.0)
        mock_redis = _make_mock_redis()
        manager._client = mock_redis

        before = time.time()
        await manager.add("AE1234")
        after = time.time()

        mock_redis.zadd.assert_awaited_once()
        call_args = mock_redis.zadd.call_args
        mapping = call_args[0][1]  # positional: (key, mapping)
        score = mapping["ae1234"]
        # Score should be roughly now + 3600
        assert before + 3600 <= score <= after + 3600

    @pytest.mark.asyncio
    async def test_add_permanent_uses_permanent_score(self):
        manager = WatchlistManager("redis://fake:6379", default_ttl_seconds=60.0)
        mock_redis = _make_mock_redis()
        manager._client = mock_redis

        await manager.add_permanent("AE5678")

        mapping = mock_redis.zadd.call_args[0][1]
        assert mapping["ae5678"] == _PERMANENT_SCORE

    @pytest.mark.asyncio
    async def test_add_per_call_ttl_overrides_default(self):
        manager = WatchlistManager("redis://fake:6379", default_ttl_seconds=60.0)
        mock_redis = _make_mock_redis()
        manager._client = mock_redis

        before = time.time()
        await manager.add("ABCDEF", ttl_seconds=120.0)
        after = time.time()

        mapping = mock_redis.zadd.call_args[0][1]
        score = mapping["abcdef"]
        assert before + 120 <= score <= after + 120

    @pytest.mark.asyncio
    async def test_add_lowercases_icao24(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        manager._client = mock_redis

        await manager.add("AE1234")
        mapping = mock_redis.zadd.call_args[0][1]
        assert "ae1234" in mapping

    @pytest.mark.asyncio
    async def test_remove_calls_zrem(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        manager._client = mock_redis

        await manager.remove("AE1234")
        mock_redis.zrem.assert_awaited_once_with(_WATCHLIST_KEY, "ae1234")

    @pytest.mark.asyncio
    async def test_contains_returns_true_for_active_entry(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        # Score = future timestamp → not expired
        mock_redis.zscore = AsyncMock(return_value=time.time() + 3600)
        manager._client = mock_redis

        assert await manager.contains("ae1234") is True

    @pytest.mark.asyncio
    async def test_contains_returns_false_for_expired_entry(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        # Score = past timestamp → expired
        mock_redis.zscore = AsyncMock(return_value=time.time() - 1)
        manager._client = mock_redis

        assert await manager.contains("ae1234") is False

    @pytest.mark.asyncio
    async def test_contains_returns_false_for_missing_entry(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        mock_redis.zscore = AsyncMock(return_value=None)
        manager._client = mock_redis

        assert await manager.contains("ae9999") is False

    @pytest.mark.asyncio
    async def test_no_op_when_client_is_none(self):
        manager = WatchlistManager("redis://fake:6379")
        # _client not set — all operations should be no-ops
        await manager.add("ae1234")
        await manager.remove("ae1234")
        result = await manager.get_active()
        assert result == []
        count = await manager.size()
        assert count == 0


# ---------------------------------------------------------------------------
# WatchlistManager — get_active / cleanup
# ---------------------------------------------------------------------------
class TestWatchlistManagerRead:
    @pytest.mark.asyncio
    async def test_get_active_queries_from_now_to_inf(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        mock_redis.zrangebyscore = AsyncMock(return_value=["ae1234", "ae5678"])
        manager._client = mock_redis

        before = time.time()
        result = await manager.get_active()
        after = time.time()

        assert result == ["ae1234", "ae5678"]
        call_args = mock_redis.zrangebyscore.call_args[0]
        # call: zrangebyscore(key, min_score, "+inf")
        assert call_args[0] == _WATCHLIST_KEY
        assert before <= call_args[1] <= after
        assert call_args[2] == "+inf"

    @pytest.mark.asyncio
    async def test_cleanup_removes_expired_entries(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        mock_redis.zremrangebyscore = AsyncMock(return_value=3)
        manager._client = mock_redis

        removed = await manager.cleanup_expired()
        assert removed == 3
        # Check that zremrangebyscore was called with the right range
        call_args = mock_redis.zremrangebyscore.call_args[0]
        assert call_args[0] == _WATCHLIST_KEY
        assert call_args[1] == "-inf"
        # Upper bound should be just before now
        assert call_args[2] < time.time()

    @pytest.mark.asyncio
    async def test_cleanup_returns_zero_when_nothing_removed(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        mock_redis.zremrangebyscore = AsyncMock(return_value=0)
        manager._client = mock_redis

        removed = await manager.cleanup_expired()
        assert removed == 0

    @pytest.mark.asyncio
    async def test_size_calls_zcard(self):
        manager = WatchlistManager("redis://fake:6379")
        mock_redis = _make_mock_redis()
        mock_redis.zcard = AsyncMock(return_value=7)
        manager._client = mock_redis

        assert await manager.size() == 7


# ---------------------------------------------------------------------------
# WatchlistManager — expiry score helpers
# ---------------------------------------------------------------------------
class TestExpiryScore:
    def test_permanent_score_is_constant(self):
        manager = WatchlistManager("redis://fake:6379")
        assert manager._expiry_score(None) == _PERMANENT_SCORE

    def test_timed_score_is_approximately_now_plus_ttl(self):
        manager = WatchlistManager("redis://fake:6379")
        ttl = 600.0
        before = time.time()
        score = manager._expiry_score(ttl)
        after = time.time()
        assert before + ttl <= score <= after + ttl

    def test_permanent_score_never_expires_within_normal_now(self):
        """PERMANENT_SCORE should be far in the future relative to any real timestamp."""
        assert _PERMANENT_SCORE > time.time() + 86_400 * 365 * 100  # > 100 years


# ---------------------------------------------------------------------------
# fetch_icao_list() — HTTP mocked
# ---------------------------------------------------------------------------
class TestFetchIcaoList:
    def _make_state_response(self, states):
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = AsyncMock(return_value={"time": 1_700_000_000, "states": states})
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)
        return mock_response

    def _make_client(self):
        client = OpenSkyClient(rate_limit_period=0.001)
        client._limiter = _make_mock_limiter()
        return client

    @pytest.mark.asyncio
    async def test_returns_empty_for_empty_list(self):
        client = self._make_client()
        client._session = MagicMock()

        result = await client.fetch_icao_list([])
        assert result == []
        # Should not have made any HTTP request
        client._session.get.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_translated_aircraft(self):
        client = self._make_client()
        mock_session = MagicMock()
        mock_session.get.return_value = self._make_state_response([_make_sv()])
        client._session = mock_session

        result = await client.fetch_icao_list(["ae1234"])

        assert len(result) == 1
        assert result[0]["hex"] == "ae1234"
        assert result[0]["_source"] == "opensky_watchlist"

    @pytest.mark.asyncio
    async def test_source_tag_is_opensky_watchlist(self):
        """Watchlist contacts must be distinguishable from bbox contacts in Kafka."""
        client = self._make_client()
        mock_session = MagicMock()
        mock_session.get.return_value = self._make_state_response([_make_sv()])
        client._session = mock_session

        result = await client.fetch_icao_list(["ae1234"])
        assert result[0]["_source"] == "opensky_watchlist"

    @pytest.mark.asyncio
    async def test_icao24s_passed_as_comma_separated_param(self):
        client = self._make_client()
        mock_session = MagicMock()
        mock_session.get.return_value = self._make_state_response([])
        client._session = mock_session

        await client.fetch_icao_list(["ae1234", "ae5678", "abc123"])

        call_kwargs = mock_session.get.call_args
        params = call_kwargs[1].get("params") or call_kwargs[0][1]
        assert params["icao24"] == "ae1234,ae5678,abc123"

    @pytest.mark.asyncio
    async def test_filters_on_ground(self):
        client = self._make_client()
        mock_session = MagicMock()
        mock_session.get.return_value = self._make_state_response([_make_sv(on_ground=True)])
        client._session = mock_session

        result = await client.fetch_icao_list(["ae1234"])
        assert result == []

    @pytest.mark.asyncio
    async def test_429_returns_empty_and_penalizes(self):
        client = self._make_client()
        mock_response = AsyncMock()
        mock_response.status = 429
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)
        mock_session = MagicMock()
        mock_session.get.return_value = mock_response
        client._session = mock_session

        result = await client.fetch_icao_list(["ae1234"])
        assert result == []
        assert not client.is_healthy()
