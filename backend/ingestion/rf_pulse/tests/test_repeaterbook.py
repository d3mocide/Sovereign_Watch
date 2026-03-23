
"""Unit tests for RepeaterBookSource normalisation logic."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.repeaterbook import RepeaterBookSource


def make_source():
    """Return a RepeaterBookSource with stub dependencies (not used in unit tests)."""
    return RepeaterBookSource(
        producer=None,
        redis_client=None,
        topic="rf_sites",
        fetch_interval_h=24,
    )


def test_normalise_valid_entry():
    src = make_source()
    entry = {
        "Call Sign": "W7ABC",
        "Lat": "45.5152",
        "Long": "-122.6784",
        "Frequency": "147.300",
        "Input Freq": "147.900",
        "PL": "100.0",
        "State": "OR",
        "Nearest City": "Portland",
        "Operational Status": "On-air",
        "Use": "OPEN",
        "FM Analog": "Yes",
    }
    record = src._normalise(entry)
    assert record is not None
    assert record["callsign"] == "W7ABC"
    assert record["lat"] == 45.5152
    assert record["lon"] == -122.6784
    assert record["output_freq"] == 147.300
    assert record["input_freq"] == 147.900
    assert record["tone_ctcss"] == 100.0
    assert record["state"] == "OR"
    assert record["city"] == "Portland"
    assert record["source"] == "repeaterbook"
    assert record["service"] == "ham"
    assert record["country"] == "US"
    assert "FM Analog" in record["modes"]


def test_normalise_zero_coordinates_returns_none():
    src = make_source()
    entry = {"Call Sign": "W7XYZ", "Lat": "0", "Long": "0"}
    assert src._normalise(entry) is None


def test_normalise_invalid_lat_lon_returns_none():
    src = make_source()
    entry = {"Call Sign": "W7XYZ", "Lat": "bad", "Long": "also-bad"}
    assert src._normalise(entry) is None


def test_normalise_missing_lat_lon_returns_none():
    src = make_source()
    entry = {"Call Sign": "W7XYZ"}
    assert src._normalise(entry) is None


def test_normalise_emcomm_flags():
    src = make_source()
    entry = {
        "Call Sign": "W7ARES",
        "Lat": "45.0",
        "Long": "-120.0",
        "ARES": "Yes",
        "RACES": "Yes",
        "SKYWARN": "No",
        "CERT": "",
    }
    record = src._normalise(entry)
    assert record is not None
    assert "ARES" in record["emcomm_flags"]
    assert "RACES" in record["emcomm_flags"]
    assert "SKYWARN" not in record["emcomm_flags"]
    assert "CERT" not in record["emcomm_flags"]


def test_normalise_no_emcomm_flags():
    src = make_source()
    entry = {
        "Call Sign": "W7NONE",
        "Lat": "45.0",
        "Long": "-120.0",
    }
    record = src._normalise(entry)
    assert record is not None
    assert record["emcomm_flags"] == []


def test_normalise_multiple_modes():
    src = make_source()
    entry = {
        "Call Sign": "W7MULTI",
        "Lat": "45.0",
        "Long": "-120.0",
        "FM Analog": "Yes",
        "DMR": "Yes",
        "D-Star": "Yes",
        "P25": "No",
        "Fusion": "",
    }
    record = src._normalise(entry)
    assert record is not None
    assert "FM Analog" in record["modes"]
    assert "DMR" in record["modes"]
    assert "D-Star" in record["modes"]
    assert "P25" not in record["modes"]
    assert "Fusion" not in record["modes"]


def test_normalise_no_ctcss_when_zero():
    src = make_source()
    entry = {
        "Call Sign": "W7NOCTCSS",
        "Lat": "45.0",
        "Long": "-120.0",
        "PL": "0",
    }
    record = src._normalise(entry)
    assert record is not None
    assert record["tone_ctcss"] is None


def test_normalise_ctcss_from_ctcss_field():
    src = make_source()
    entry = {
        "Call Sign": "W7CTCSS",
        "Lat": "45.0",
        "Long": "-120.0",
        "CTCSS": "127.3",
    }
    record = src._normalise(entry)
    assert record is not None
    assert record["tone_ctcss"] == 127.3


def test_normalise_site_id_format():
    src = make_source()
    entry = {
        "Call Sign": "W7SITE",
        "Lat": "45.0",
        "Long": "-120.0",
        "State": "WA",
    }
    record = src._normalise(entry)
    assert record is not None
    assert record["site_id"] == "rb:W7SITE:WA"


def test_normalise_invalid_frequency_is_none():
    src = make_source()
    entry = {
        "Call Sign": "W7FREQ",
        "Lat": "45.0",
        "Long": "-120.0",
        "Frequency": "bad",
        "Input Freq": "also-bad",
    }
    record = src._normalise(entry)
    assert record is not None
    assert record["output_freq"] is None
    assert record["input_freq"] is None
