"""Batch satellite search must preserve ordering and per-row failure isolation."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

from .test_stubs import install_common_test_stubs

install_common_test_stubs()
import routers.tracks as tracks  # noqa: E402 -- dependency stubs must precede application imports


def satellite(norad, tle):
    return {
        "norad_id": str(norad),
        "name": f"Satellite {norad}",
        "tle_line1": tle,
        "tle_line2": "line2",
    }


def propagator(tle, _line2):
    if tle == "bad":
        raise ValueError("Malformed TLE")
    return SimpleNamespace(
        sgp4=lambda _jd, _fr: (
            1 if tle == "failed" else 0,
            (float(tle) if tle.isdigit() else 0, 2, 3),
            (0, 0, 0),
        )
    )


@pytest.mark.asyncio
async def test_mixed_satellites_are_batched_without_losing_alignment():
    rows = [
        satellite(1, "10"),
        satellite(2, "bad"),
        satellite(3, "failed"),
        satellite(4, "40"),
    ]
    pool = SimpleNamespace(fetch=AsyncMock(side_effect=[[], rows]))
    convert = MagicMock(
        return_value=(
            np.array([11.123456, 44.654321]),
            np.array([-1.5, -4.5]),
            np.array([0, 0]),
        )
    )
    with (
        patch.object(tracks.db, "pool", pool),
        patch.object(tracks, "Satrec", SimpleNamespace(twoline2rv=propagator)),
        patch.object(tracks, "teme_to_ecef", lambda r, _jd, _fr: r),
        patch.object(tracks, "ecef_to_lla_vectorized", convert),
    ):
        result = await tracks.search_tracks("Satellite")
    assert [r["entity_id"] for r in result] == ["SAT-1", "SAT-2", "SAT-3", "SAT-4"]
    assert [r["lat"] for r in result] == [11.12346, None, None, 44.65432]
    assert [r["lon"] for r in result] == [-1.5, None, None, -4.5]
    assert convert.call_count == 1
    assert convert.call_args.args[0].shape == (2, 3)


@pytest.mark.asyncio
@pytest.mark.parametrize("rows", [[], [satellite(1, "bad"), satellite(2, "failed")]])
async def test_no_valid_positions_skip_batch_conversion(rows):
    pool = SimpleNamespace(fetch=AsyncMock(side_effect=[[], rows]))
    convert = MagicMock()
    with (
        patch.object(tracks.db, "pool", pool),
        patch.object(tracks, "Satrec", SimpleNamespace(twoline2rv=propagator)),
        patch.object(tracks, "ecef_to_lla_vectorized", convert),
    ):
        result = await tracks.search_tracks("Satellite")
    assert len(result) == len(rows)
    assert all(r["lat"] is None for r in result)
    convert.assert_not_called()


@pytest.mark.asyncio
async def test_bad_batch_conversion_does_not_fail_good_satellite_rows():
    rows = [satellite(1, "10"), satellite(2, "40")]
    pool = SimpleNamespace(fetch=AsyncMock(side_effect=[[], rows]))

    def convert(points):
        if len(points) > 1 or points[0, 0] == 10:
            raise ValueError("Bad coordinate")
        return np.array([44.0]), np.array([-4.5]), np.array([0])

    with (
        patch.object(tracks.db, "pool", pool),
        patch.object(tracks, "Satrec", SimpleNamespace(twoline2rv=propagator)),
        patch.object(tracks, "teme_to_ecef", lambda r, _jd, _fr: r),
        patch.object(tracks, "ecef_to_lla_vectorized", convert),
    ):
        result = await tracks.search_tracks("Satellite")
    assert result[0]["lat"] is None
    assert result[1]["lat"] == 44.0
