
"""Unit tests for ARDSource normalisation logic."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.ard import ARDSource


def make_source():
    """Return an ARDSource with stub dependencies (not used in unit tests)."""
    return ARDSource(
        producer=None,
        redis_client=None,
        topic="rf_sites",
        fetch_interval_h=24,
    )


def test_normalise_valid_entry():
    src = make_source()
    row = {
        "repeaterId": "ard-001",
        "callsign": "W7PDX",
        "latitude": "45.5152",
        "longitude": "-122.6784",
        "outputFrequency": "147.3",
        "inputFrequency": "147.9",
        "ctcssTx": "100.0",
        "state": "OR",
        "nearestCity": "Portland",
        "isOpen": True,
        "isOperational": True,
    }
    record = src._normalise(row)
    assert record is not None
    assert record["callsign"] == "W7PDX"
    assert record["lat"] == 45.5152
    assert record["lon"] == -122.6784
    assert record["output_freq"] == 147.3
    assert record["input_freq"] == 147.9
    assert record["tone_ctcss"] == 100.0
    assert record["state"] == "OR"
    assert record["city"] == "Portland"
    assert record["site_id"] == "ard-001"
    assert record["source"] == "ard"
    assert record["service"] == "ham"
    assert record["country"] == "US"
    assert record["use_access"] == "OPEN"
    assert record["status"] == "On-air"


def test_normalise_zero_coordinates_returns_none():
    src = make_source()
    row = {"callsign": "W7ZERO", "latitude": "0", "longitude": "0"}
    assert src._normalise(row) is None


def test_normalise_none_coordinates_returns_none():
    src = make_source()
    row = {"callsign": "W7NONE", "latitude": None, "longitude": None}
    assert src._normalise(row) is None


def test_normalise_invalid_coordinates_returns_none():
    src = make_source()
    row = {"callsign": "W7BAD", "latitude": "bad", "longitude": "data"}
    assert src._normalise(row) is None


def test_normalise_closed_repeater():
    src = make_source()
    row = {
        "callsign": "W7CLOSED",
        "latitude": "45.0",
        "longitude": "-120.0",
        "isOpen": False,
        "isOperational": True,
    }
    record = src._normalise(row)
    assert record is not None
    assert record["use_access"] == "CLOSED"


def test_normalise_off_air_repeater():
    src = make_source()
    row = {
        "callsign": "W7OFF",
        "latitude": "45.0",
        "longitude": "-120.0",
        "isOpen": True,
        "isOperational": False,
    }
    record = src._normalise(row)
    assert record is not None
    assert record["status"] == "Off-air"


def test_normalise_emcomm_flags():
    src = make_source()
    row = {
        "callsign": "W7EM",
        "latitude": "45.0",
        "longitude": "-120.0",
        "ares": True,
        "races": False,
        "skywarn": True,
        "cert": False,
    }
    record = src._normalise(row)
    assert record is not None
    assert "ARES" in record["emcomm_flags"]
    assert "SKYWARN" in record["emcomm_flags"]
    assert "RACES" not in record["emcomm_flags"]
    assert "CERT" not in record["emcomm_flags"]


def test_normalise_no_emcomm_flags():
    src = make_source()
    row = {
        "callsign": "W7CLEAN",
        "latitude": "45.0",
        "longitude": "-120.0",
    }
    record = src._normalise(row)
    assert record is not None
    assert record["emcomm_flags"] == []


def test_normalise_no_ctcss_when_zero():
    src = make_source()
    row = {
        "callsign": "W7NOCTCSS",
        "latitude": "45.0",
        "longitude": "-120.0",
        "ctcssTx": "0",
    }
    record = src._normalise(row)
    assert record is not None
    assert record["tone_ctcss"] is None


def test_normalise_invalid_frequencies_are_none():
    src = make_source()
    row = {
        "callsign": "W7BADFREQ",
        "latitude": "45.0",
        "longitude": "-120.0",
        "outputFrequency": "bad",
        "inputFrequency": None,
    }
    record = src._normalise(row)
    assert record is not None
    assert record["output_freq"] is None
    assert record["input_freq"] is None


def test_normalise_site_id_fallback_when_no_repeater_id():
    src = make_source()
    row = {
        "callsign": "W7FALL",
        "latitude": "45.0",
        "longitude": "-120.0",
        "state": "CA",
    }
    record = src._normalise(row)
    assert record is not None
    assert record["site_id"] == "ard:W7FALL:CA"


def test_normalise_meta_fields():
    src = make_source()
    row = {
        "callsign": "W7META",
        "latitude": "45.0",
        "longitude": "-120.0",
        "county": "Multnomah",
        "isOperational": True,
        "isCoordinated": True,
    }
    record = src._normalise(row)
    assert record is not None
    assert record["meta"]["county"] == "Multnomah"
    assert record["meta"]["operational"] is True
    assert record["meta"]["coordinated"] is True
