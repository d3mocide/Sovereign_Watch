"""Unit tests for SpaceWeatherSource helper logic."""
import sys
import os
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.space_weather import (
    REDIS_KEY_AURORA_LAST_FETCH,
    REDIS_KEY_KP_LAST_FETCH,
    REDIS_KEY_SCALES_LAST_FETCH,
    _kp_to_storm_level,
    SpaceWeatherSource,
)


def test_kp_storm_levels():
    assert _kp_to_storm_level(0.0) == "quiet"
    assert _kp_to_storm_level(2.9) == "quiet"
    assert _kp_to_storm_level(3.0) == "unsettled"
    assert _kp_to_storm_level(4.0) == "active"
    assert _kp_to_storm_level(5.0) == "G1"
    assert _kp_to_storm_level(7.0) == "G3"
    assert _kp_to_storm_level(9.0) == "G5"


def test_source_instantiation():
    src = SpaceWeatherSource(
        client=None,
        redis_client=None,
        db_url="postgresql://localhost/test",
        aurora_interval_s=300,
        kp_interval_s=900,
    )
    assert src.aurora_interval == 300
    assert src.kp_interval == 900


def test_seen_kp_times_dedup():
    src = SpaceWeatherSource(
        client=None,
        redis_client=None,
        db_url="postgresql://localhost/test",
        aurora_interval_s=300,
        kp_interval_s=900,
    )
    src._seen_kp_times.add("2026-03-21T10:00:00")
    assert "2026-03-21T10:00:00" in src._seen_kp_times
    assert "2026-03-21T10:01:00" not in src._seen_kp_times


@pytest.mark.anyio
async def test_get_last_fetch_reads_redis_timestamp():
    redis_client = AsyncMock()
    redis_client.get = AsyncMock(return_value="123.5")
    src = SpaceWeatherSource(
        client=None,
        redis_client=redis_client,
        db_url="postgresql://localhost/test",
        aurora_interval_s=300,
        kp_interval_s=900,
    )

    last_fetch = await src._get_last_fetch(REDIS_KEY_KP_LAST_FETCH)

    assert last_fetch == 123.5
    redis_client.get.assert_awaited_once_with(REDIS_KEY_KP_LAST_FETCH)


@pytest.mark.anyio
async def test_set_last_fetch_persists_redis_timestamp():
    redis_client = AsyncMock()
    redis_client.set = AsyncMock()
    src = SpaceWeatherSource(
        client=None,
        redis_client=redis_client,
        db_url="postgresql://localhost/test",
        aurora_interval_s=300,
        kp_interval_s=900,
        scales_interval_s=900,
    )

    await src._set_last_fetch(REDIS_KEY_AURORA_LAST_FETCH, src.aurora_interval)

    redis_client.set.assert_awaited_once()
    call_args = redis_client.set.await_args
    assert call_args.args[0] == REDIS_KEY_AURORA_LAST_FETCH
    assert float(call_args.args[1]) > 0
    assert call_args.kwargs["ex"] == src.aurora_interval * 2


def test_space_weather_last_fetch_keys_are_distinct():
    assert {REDIS_KEY_KP_LAST_FETCH, REDIS_KEY_AURORA_LAST_FETCH, REDIS_KEY_SCALES_LAST_FETCH} == {
        "space_weather:kp:last_fetch",
        "space_weather:aurora:last_fetch",
        "space_weather:scales:last_fetch",
    }
