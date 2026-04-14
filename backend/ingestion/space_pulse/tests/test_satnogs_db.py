"""Unit tests for SatNOGS DB source normalisation logic."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.satnogs_db import SatNOGSDBSource


def make_source():
    """Return a SatNOGSDBSource with stub producer/redis (not used in unit tests)."""
    return SatNOGSDBSource(
        client=None,
        producer=None,
        redis_client=None,
        topic="satnogs_transmitters",
        fetch_interval_h=24,
    )


def test_normalise_valid_transmitter():
    src = make_source()
    tx = {
        "uuid": "abc-123",
        "norad_cat_id": 25544,
        "sat_name": "ISS (ZARYA)",
        "description": "APRS",
        "alive": True,
        "type": "Transmitter",
        "uplink_low": 145990000,
        "uplink_high": None,
        "downlink_low": 145825000,
        "downlink_high": None,
        "mode": "FM",
        "invert": False,
        "baud": None,
        "status": "active",
    }
    record = src._normalise(tx, "2026-03-21T00:00:00+00:00")
    assert record is not None
    assert record["norad_id"] == "25544"
    assert record["downlink_low"] == 145825000
    assert record["mode"] == "FM"
    assert record["source"] == "satnogs_db"


def test_normalise_missing_norad_id_returns_none():
    src = make_source()
    tx = {
        "uuid": "xyz",
        "norad_cat_id": None,
        "downlink_low": 145825000,
    }
    assert src._normalise(tx, "2026-03-21T00:00:00+00:00") is None


def test_normalise_no_frequencies_returns_none():
    src = make_source()
    tx = {
        "uuid": "xyz",
        "norad_cat_id": 99999,
        "downlink_low": None,
        "downlink_high": None,
        "uplink_low": None,
        "uplink_high": None,
    }
    assert src._normalise(tx, "2026-03-21T00:00:00+00:00") is None


def test_normalise_uplink_only_is_valid():
    src = make_source()
    tx = {
        "uuid": "xyz",
        "norad_cat_id": 99999,
        "sat_name": "CUBESAT-X",
        "downlink_low": None,
        "uplink_low": 435000000,
        "mode": "CW",
        "status": "active",
    }
    record = src._normalise(tx, "2026-03-21T00:00:00+00:00")
    assert record is not None
    assert record["uplink_low"] == 435000000
    assert record["downlink_low"] is None
