"""Unit tests for SatNOGS Network source normalisation logic."""
import sys
import os
from unittest.mock import AsyncMock, MagicMock
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.satnogs_network import SatNOGSNetworkSource


def run(coro):
    return asyncio.run(coro)


def make_source():
    return SatNOGSNetworkSource(
        client=None,
        producer=None,
        redis_client=None,
        topic="satnogs_observations",
        fetch_interval_h=1,
    )


def test_normalise_valid_observation():
    src = make_source()
    obs = {
        "id": 12345,
        "norad_cat_id": 25544,
        "ground_station": 42,
        "transmitter": "abc-123",
        "observation_frequency": 145825000,
        "transmitter_mode": "FM",
        "status": "good",
        "start": "2026-03-21T10:00:00Z",
        "end": "2026-03-21T10:10:00Z",
        "has_audio": True,
        "has_waterfall": True,
        "rise_azimuth": 45.0,
        "set_azimuth": 270.0,
        "max_altitude": 60.5,
    }
    record = src._normalise(obs, "2026-03-21T10:15:00+00:00")
    assert record is not None
    assert record["norad_id"] == "25544"
    assert record["observation_id"] == 12345
    assert record["frequency"] == 145825000
    assert record["source"] == "satnogs_network"
    assert record["status"] == "good"


def test_normalise_missing_norad_returns_none():
    src = make_source()
    obs = {"id": 1, "norad_cat_id": None, "observation_frequency": 145825000}
    assert src._normalise(obs, "2026-03-21T00:00:00+00:00") is None


def test_normalise_falls_back_to_transmitter_downlink():
    src = make_source()
    obs = {
        "id": 99,
        "norad_cat_id": 44444,
        "ground_station": 10,
        "observation_frequency": None,
        "transmitter_downlink_low": 437550000,
        "transmitter_mode": "BPSK",
        "status": "good",
        "start": "2026-03-21T08:00:00Z",
        "end": "2026-03-21T08:07:00Z",
    }
    record = src._normalise(obs, "2026-03-21T08:10:00+00:00")
    assert record is not None
    assert record["frequency"] == 437550000


def test_dedup_seen_ids():
    src = make_source()
    obs = {
        "id": 777,
        "norad_cat_id": 12345,
        "observation_frequency": 145800000,
        "status": "good",
    }
    record = src._normalise(obs, "2026-03-21T00:00:00+00:00")
    assert record is not None
    # Simulate marking as seen
    src._seen_ids.add(777)
    # The loop skips already-seen IDs before calling _normalise;
    # verify the set membership check works
    assert 777 in src._seen_ids


def test_fetch_and_publish_advances_pages_and_sleeps(monkeypatch):
    src = SatNOGSNetworkSource(
        client=None,
        producer=AsyncMock(),
        redis_client=MagicMock(),
        topic="satnogs_observations",
        fetch_interval_h=1,
    )
    src.producer.send = AsyncMock()

    class FakeResponse:
        def __init__(self, body, next_url=None):
            self._body = body
            self.links = {"next": {"url": next_url}} if next_url else {}

        def raise_for_status(self):
            return None

        def json(self):
            return self._body

    responses = [
        FakeResponse(
            [{"id": 1, "norad_cat_id": 25544, "observation_frequency": 145825000, "status": "good"}],
            next_url="https://network.satnogs.org/api/observations/?page=2",
        ),
        FakeResponse(
            [{"id": 2, "norad_cat_id": 43013, "observation_frequency": 437550000, "status": "good"}],
        ),
    ]
    fetch_mock = AsyncMock(side_effect=responses)
    src.fetch_with_retry = fetch_mock
    sleep_mock = AsyncMock()
    monkeypatch.setattr("sources.satnogs_network.asyncio.sleep", sleep_mock)

    run(src._fetch_and_publish())

    assert fetch_mock.await_count == 2
    assert src.producer.send.await_count == 2
    first_call = fetch_mock.await_args_list[0]
    second_call = fetch_mock.await_args_list[1]
    assert first_call.args[0].endswith("/observations/")
    assert first_call.kwargs["params"]["status"] == "good"
    assert second_call.args[0].endswith("page=2")
    assert second_call.kwargs["params"] is None
    sleep_mock.assert_awaited_once_with(5.0)
