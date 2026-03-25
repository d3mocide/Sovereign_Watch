"""
Unit tests for opensky_client.py.

Covers:
  - nm_radius_to_bbox() geometry
  - translate_state_vector() field mapping and unit conversions
  - OpenSkyClient.fetch_bbox() HTTP interaction (mocked)
  - OpenSkyClient cooldown / penalize / reset logic
"""

import asyncio
import time
from typing import List
from unittest.mock import AsyncMock, MagicMock

import pytest

# opensky_client only needs aiohttp and aiolimiter — both stubbed in conftest.
from opensky_client import (
    _M_TO_FT,
    _MS_TO_FTMIN,
    _MS_TO_KT,
    _NM_TO_KM,
    OpenSkyClient,
    nm_radius_to_bbox,
    translate_state_vector,
)


# ---------------------------------------------------------------------------
# nm_radius_to_bbox
# ---------------------------------------------------------------------------
class TestNmRadiusToBbox:
    def test_basic_symmetry(self):
        """bbox should be symmetric around the center point."""
        lat, lon, radius = 45.0, -122.0, 150.0
        lamin, lomin, lamax, lomax = nm_radius_to_bbox(lat, lon, radius)

        assert lamin < lat < lamax
        assert lomin < lon < lomax
        # Latitude offsets should be equal
        assert abs((lamax - lat) - (lat - lamin)) < 1e-6

    def test_radius_scales_with_nm(self):
        """Larger radius → larger bbox."""
        small = nm_radius_to_bbox(0.0, 0.0, 50.0)
        large = nm_radius_to_bbox(0.0, 0.0, 200.0)

        small_lat_span = small[2] - small[0]
        large_lat_span = large[2] - large[0]
        assert large_lat_span > small_lat_span

    def test_clamps_to_valid_range(self):
        """Near the poles, lat must stay in [-90, 90]."""
        lamin, lomin, lamax, lomax = nm_radius_to_bbox(89.0, 0.0, 500.0)
        assert lamin >= -90.0
        assert lamax <= 90.0

    def test_equator_lat_delta_matches_formula(self):
        """At equator, lat_delta = radius_km / 111."""
        radius_nm = 100.0
        radius_km = radius_nm * _NM_TO_KM
        expected_lat_delta = radius_km / 111.0

        lamin, _, lamax, _ = nm_radius_to_bbox(0.0, 0.0, radius_nm)
        actual_lat_delta = (lamax - lamin) / 2
        assert abs(actual_lat_delta - expected_lat_delta) < 0.01

    def test_lon_delta_widens_toward_pole(self):
        """At higher latitudes the longitude span should be wider (cos shrinks)."""
        _, lomin_eq, _, lomax_eq = nm_radius_to_bbox(0.0, 0.0, 150.0)
        _, lomin_hi, _, lomax_hi = nm_radius_to_bbox(60.0, 0.0, 150.0)

        span_eq = lomax_eq - lomin_eq
        span_hi = lomax_hi - lomin_hi
        assert span_hi > span_eq


# ---------------------------------------------------------------------------
# translate_state_vector
# ---------------------------------------------------------------------------
def _make_sv(
    icao24="a1b2c3",
    callsign="UAL123  ",
    origin_country="United States",
    time_position=1_700_000_000,
    last_contact=1_700_000_001,
    longitude=-122.5,
    latitude=45.5,
    baro_altitude=10_000.0,  # metres
    on_ground=False,
    velocity=250.0,  # m/s
    true_track=90.0,
    vertical_rate=5.0,  # m/s
    sensors=None,
    geo_altitude=10_100.0,  # metres
    squawk="1234",
    spi=False,
    position_source=0,
) -> List:
    return [
        icao24,
        callsign,
        origin_country,
        time_position,
        last_contact,
        longitude,
        latitude,
        baro_altitude,
        on_ground,
        velocity,
        true_track,
        vertical_rate,
        sensors,
        geo_altitude,
        squawk,
        spi,
        position_source,
    ]


class TestTranslateStateVector:
    def test_returns_none_for_missing_lat_lon(self):
        sv = _make_sv(latitude=None)
        assert translate_state_vector(sv, time.time()) is None

    def test_returns_none_for_on_ground(self):
        sv = _make_sv(on_ground=True)
        assert translate_state_vector(sv, time.time()) is None

    def test_returns_none_for_short_vector(self):
        assert translate_state_vector([1, 2, 3], time.time()) is None

    def test_basic_fields(self):
        sv = _make_sv()
        result = translate_state_vector(sv, time.time())

        assert result is not None
        assert result["hex"] == "a1b2c3"
        assert result["flight"] == "UAL123"  # stripped
        assert result["lat"] == 45.5
        assert result["lon"] == -122.5
        assert result["squawk"] == "1234"
        assert result["ownOp"] == "United States"
        assert result["_source"] == "opensky"

    def test_altitude_converted_to_feet(self):
        sv = _make_sv(baro_altitude=10_000.0, geo_altitude=10_100.0)
        result = translate_state_vector(sv, time.time())

        assert result is not None
        assert abs(result["baro_alt"] - 10_000.0 * _M_TO_FT) < 0.1
        assert abs(result["geom_alt"] - 10_100.0 * _M_TO_FT) < 0.1

    def test_velocity_converted_to_knots(self):
        sv = _make_sv(velocity=250.0)
        result = translate_state_vector(sv, time.time())

        assert result is not None
        assert abs(result["gs"] - 250.0 * _MS_TO_KT) < 0.01

    def test_vertical_rate_converted_to_ft_per_min(self):
        sv = _make_sv(vertical_rate=5.0)
        result = translate_state_vector(sv, time.time())

        assert result is not None
        assert abs(result["baro_rate"] - 5.0 * _MS_TO_FTMIN) < 0.1

    def test_none_altitude_fields(self):
        sv = _make_sv(baro_altitude=None, geo_altitude=None)
        result = translate_state_vector(sv, time.time())

        assert result is not None
        assert result["baro_alt"] is None
        assert result["geom_alt"] is None

    def test_none_velocity_fields(self):
        sv = _make_sv(velocity=None, vertical_rate=None)
        result = translate_state_vector(sv, time.time())

        assert result is not None
        assert result["gs"] is None
        assert result["baro_rate"] is None

    def test_seen_pos_derived_from_fetched_at(self):
        now = 1_700_001_000.0
        time_pos = 1_700_000_990.0  # 10 s ago
        sv = _make_sv(time_position=time_pos)
        result = translate_state_vector(sv, now)

        assert result is not None
        assert abs(result["seen_pos"] - 10.0) < 0.01

    def test_seen_pos_never_negative(self):
        # future time_position (clock skew) should clamp to 0
        now = 1_700_000_000.0
        sv = _make_sv(time_position=now + 100)
        result = translate_state_vector(sv, now)

        assert result is not None
        assert result["seen_pos"] == 0.0

    def test_track_forwarded_unchanged(self):
        sv = _make_sv(true_track=270.0)
        result = translate_state_vector(sv, time.time())

        assert result is not None
        assert result["track"] == 270.0


# ---------------------------------------------------------------------------
# OpenSkyClient — cooldown / penalize / reset
# ---------------------------------------------------------------------------
class TestOpenSkyClientCooldown:
    def test_healthy_by_default(self):
        client = OpenSkyClient()
        assert client.is_healthy()

    def test_penalize_sets_cooldown(self):
        client = OpenSkyClient()
        client.penalize()
        assert not client.is_healthy()
        assert client.cooldown_until > time.time()

    def test_penalize_starts_at_30s(self):
        client = OpenSkyClient()
        before = time.time()
        client.penalize()
        assert client.cooldown_until >= before + 29.0  # 30 s ± scheduling jitter

    def test_penalize_doubles_on_successive_calls(self):
        client = OpenSkyClient()
        client.penalize()  # 30 s cooldown
        first_step = client._cooldown_step
        client.penalize()  # should escalate (still in cooldown window)
        assert client._cooldown_step == min(first_step * 2, 300.0)

    def test_penalize_doubles_after_cooldown_expiry_without_success(self):
        client = OpenSkyClient()
        client.penalize()
        first_step = client._cooldown_step

        # Match the watchlist-loop behavior: wait for cooldown expiry, retry,
        # and get another 429 before any successful response can reset state.
        client.cooldown_until = time.time() - 1
        client.penalize()

        assert client._cooldown_step == min(first_step * 2, 300.0)

    def test_penalize_caps_at_300s(self):
        client = OpenSkyClient()
        # Drive cooldown to cap
        for _ in range(10):
            client.penalize()
        assert client._cooldown_step == 300.0

    def test_reset_clears_cooldown(self):
        client = OpenSkyClient()
        client.penalize()
        client.reset_cooldown()
        assert client.is_healthy()
        assert client.cooldown_until == 0.0
        assert client._consecutive_penalties == 0

    def test_rate_limit_period_authenticated_default(self):
        client = OpenSkyClient(client_id="id", client_secret="secret")
        assert client.rate_limit_period == 22.0

    def test_rate_limit_period_anonymous_default(self):
        client = OpenSkyClient()
        assert client.rate_limit_period == 300.0

    def test_rate_limit_period_override(self):
        client = OpenSkyClient(rate_limit_period=60.0)
        assert client.rate_limit_period == 60.0


# ---------------------------------------------------------------------------
# OpenSkyClient — fetch_bbox (HTTP mocked)
# ---------------------------------------------------------------------------
class TestOpenSkyClientFetch:
    """
    fetch_bbox() is tested by injecting a pre-built aiohttp.ClientSession mock
    into the client after start(), bypassing real network calls.
    """

    def _make_state_response(self, states):
        """Build a fake aiohttp response returning the given states payload."""
        mock_response = AsyncMock()
        mock_response.status = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = AsyncMock(
            return_value={"time": 1_700_000_000, "states": states}
        )
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)
        return mock_response

    def _make_error_response(self, status: int):
        from aiohttp import ClientResponseError

        mock_response = AsyncMock()
        mock_response.status = status
        mock_response.raise_for_status = MagicMock(
            side_effect=ClientResponseError(
                request_info=MagicMock(), history=(), status=status
            )
        )
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)
        return mock_response

    def _make_client(self) -> "OpenSkyClient":
        """Return a client with the rate-limiter replaced by an async-compatible mock."""
        client = OpenSkyClient(rate_limit_period=0.001)
        # conftest stubs aiolimiter.AsyncLimiter as MagicMock, which doesn't
        # support `async with`.  Replace _limiter with an AsyncMock so that
        # `async with self._limiter:` works inside fetch_bbox().
        limiter_mock = AsyncMock()
        limiter_mock.__aenter__ = AsyncMock(return_value=None)
        limiter_mock.__aexit__ = AsyncMock(return_value=False)
        client._limiter = limiter_mock
        return client

    @pytest.mark.asyncio
    async def test_fetch_returns_translated_aircraft(self):
        client = self._make_client()
        mock_session = MagicMock()
        mock_session.get.return_value = self._make_state_response([_make_sv()])
        client._session = mock_session

        aircraft = await client.fetch_bbox(44.0, -123.0, 47.0, -121.0)

        assert len(aircraft) == 1
        assert aircraft[0]["hex"] == "a1b2c3"
        assert aircraft[0]["_source"] == "opensky"

    @pytest.mark.asyncio
    async def test_fetch_filters_on_ground(self):
        client = self._make_client()
        mock_session = MagicMock()
        mock_session.get.return_value = self._make_state_response(
            [_make_sv(on_ground=True)]
        )
        client._session = mock_session

        aircraft = await client.fetch_bbox(44.0, -123.0, 47.0, -121.0)
        assert aircraft == []

    @pytest.mark.asyncio
    async def test_fetch_429_triggers_penalize(self):
        client = self._make_client()
        mock_response = AsyncMock()
        mock_response.status = 429
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=False)

        mock_session = MagicMock()
        mock_session.get.return_value = mock_response
        client._session = mock_session

        result = await client.fetch_bbox(44.0, -123.0, 47.0, -121.0)

        assert result == []
        assert not client.is_healthy()

    @pytest.mark.asyncio
    async def test_fetch_empty_states_returns_empty_list(self):
        client = self._make_client()
        mock_session = MagicMock()
        mock_session.get.return_value = self._make_state_response([])
        client._session = mock_session

        aircraft = await client.fetch_bbox(44.0, -123.0, 47.0, -121.0)
        assert aircraft == []
        assert client.is_healthy()  # Empty response is not an error

    @pytest.mark.asyncio
    async def test_fetch_timeout_triggers_penalize(self):
        client = self._make_client()
        mock_session = MagicMock()
        # Simulate timeout inside context manager
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(side_effect=asyncio.TimeoutError())
        mock_cm.__aexit__ = AsyncMock(return_value=False)
        mock_session.get.return_value = mock_cm
        client._session = mock_session

        result = await client.fetch_bbox(44.0, -123.0, 47.0, -121.0)
        assert result == []
        assert not client.is_healthy()
