"""Orbital formatting must preserve whole-second labels and precise epochs."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import numpy as np
import pytest

from .test_stubs import install_common_test_stubs

install_common_test_stubs()
import routers.orbital as orbital  # noqa: E402 -- stub dependencies first


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "fixed",
    [
        datetime(2026, 12, 31, 23, 59, 59, 999999, tzinfo=timezone.utc),
        datetime(2028, 2, 29, 23, 59, 59, 123456, tzinfo=timezone.utc),
    ],
)
@pytest.mark.parametrize("endpoint", ["groundtrack", "passes"])
async def test_timestamp_parity_and_fractional_propagation_epoch(fixed, endpoint):
    class Clock(datetime):
        @classmethod
        def now(cls, _tz=None):
            return fixed

    calls = []

    def propagate(jd, fr):
        calls.append((jd.copy(), fr.copy()))
        points = np.tile([7000.0, 100.0, 2000.0], (len(jd), 1))
        return np.zeros(len(jd), dtype=int), points, np.zeros_like(points)

    sat = SimpleNamespace(sgp4_array=propagate)
    rows = [
        {
            "norad_id": "1",
            "name": "Test Satellite",
            "category": "gps",
            "tle_line1": "L1",
            "tle_line2": "L2",
        }
    ]

    def elevations(_obs, positions, _lat, _lon):
        el = np.zeros(len(positions))
        el[:3] = [20, 40, 20]
        return np.full(len(positions), 90.0), el, np.full(len(positions), 1000.0)

    with (
        patch.object(orbital.db, "pool", object()),
        patch.object(orbital.db, "redis_client", None),
        patch.object(orbital, "datetime", Clock),
        patch.object(orbital, "_load_satellites", AsyncMock(return_value=rows)),
        patch.object(orbital, "Satrec", SimpleNamespace(twoline2rv=lambda _a, _b: sat)),
        patch.object(orbital, "ecef_to_topocentric_vectorized", elevations),
    ):
        if endpoint == "groundtrack":
            points = await orbital.get_groundtrack("1", minutes=1, step_seconds=30)
            step = 30
        else:
            passes = await orbital.get_passes(
                lat=45,
                lon=-122,
                hours=1,
                min_elevation=10,
                norad_ids="1",
                category=None,
                constellation=None,
                limit=None,
            )
            assert len(passes) == 1
            points = passes[0]["points"]
            step = 10
    assert len(points) == 3
    assert [p["t"] for p in points] == [
        (fixed + timedelta(seconds=i * step)).strftime("%Y-%m-%dT%H:%M:%SZ")
        for i in range(3)
    ]
    expected_jd, expected_fr = orbital._jday_from_datetime(fixed)
    assert calls[0][0][0] == expected_jd
    assert calls[0][1][0] == expected_fr
    assert (
        calls[0][1][0] != orbital._jday_from_datetime(fixed.replace(microsecond=0))[1]
    )
