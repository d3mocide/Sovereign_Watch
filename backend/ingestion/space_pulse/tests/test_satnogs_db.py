"""Unit tests for SatNOGS DB source normalisation logic."""
import sys
import os
from unittest.mock import AsyncMock, MagicMock
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.satnogs_db import SatNOGSDBSource


def run(coro):
    return asyncio.run(coro)


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


def test_fetch_and_publish_advances_pages_and_sleeps(monkeypatch):
    src = SatNOGSDBSource(
        client=None,
        producer=AsyncMock(),
        redis_client=MagicMock(),
        topic="satnogs_transmitters",
        fetch_interval_h=24,
    )
    src.producer.send = AsyncMock()

    class FakeResponse:
        def __init__(self, body):
            self._body = body

        def raise_for_status(self):
            return None

        def json(self):
            return self._body

    responses = [
        FakeResponse(
            {
                "results": [{"uuid": "a", "norad_cat_id": 1, "downlink_low": 100}],
                "next": "https://db.satnogs.org/api/transmitters/?page=2",
            }
        ),
        FakeResponse(
            {
                "results": [{"uuid": "b", "norad_cat_id": 2, "downlink_low": 200}],
                "next": None,
            }
        ),
    ]
    fetch_mock = AsyncMock(side_effect=responses)
    src.fetch_with_retry = fetch_mock
    sleep_mock = AsyncMock()
    monkeypatch.setattr("sources.satnogs_db.asyncio.sleep", sleep_mock)

    run(src._fetch_and_publish())

    assert fetch_mock.await_count == 2
    assert src.producer.send.await_count == 2
    first_call = fetch_mock.await_args_list[0]
    second_call = fetch_mock.await_args_list[1]
    assert first_call.args[0].endswith("/transmitters/")
    assert first_call.kwargs["params"]["status"] == "active"
    assert second_call.args[0].endswith("page=2")
    assert second_call.kwargs["params"] is None
    sleep_mock.assert_awaited_once_with(5.0)
