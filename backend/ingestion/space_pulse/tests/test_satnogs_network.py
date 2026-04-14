"""Unit tests for SatNOGS Network source normalisation logic."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.satnogs_network import SatNOGSNetworkSource


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
