"""Unit tests for InfraPoller pure helper functions."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import (
    build_cable_country_index,
    dms_to_decimal,
    extract_station_country,
    ioda_severity,
    normalize_country_label,
    parse_float,
)


# ---------------------------------------------------------------------------
# dms_to_decimal
# ---------------------------------------------------------------------------

def test_dms_north():
    result = dms_to_decimal("45", "30", "0", "N")
    assert result == 45.5


def test_dms_south():
    result = dms_to_decimal("45", "30", "0", "S")
    assert result == -45.5


def test_dms_east():
    result = dms_to_decimal("122", "0", "0", "E")
    assert result == 122.0


def test_dms_west():
    result = dms_to_decimal("122", "0", "0", "W")
    assert result == -122.0


def test_dms_with_seconds():
    # 10° 30' 18" N  →  10 + 30/60 + 18/3600 = 10.505
    result = dms_to_decimal("10", "30", "18", "N")
    assert abs(result - 10.505) < 1e-9


def test_dms_empty_minutes_and_seconds():
    result = dms_to_decimal("33", "", "", "N")
    assert result == 33.0


def test_dms_whitespace_direction():
    result = dms_to_decimal("45", "0", "0", " n ")
    assert result == 45.0


def test_dms_missing_direction_returns_none():
    result = dms_to_decimal("45", "0", "0", "")
    assert result is None


def test_dms_invalid_degree_returns_none():
    result = dms_to_decimal("abc", "0", "0", "N")
    assert result is None


def test_dms_none_inputs_returns_none():
    result = dms_to_decimal(None, None, None, None)
    assert result is None


# ---------------------------------------------------------------------------
# parse_float
# ---------------------------------------------------------------------------

def test_parse_float_integer_string():
    assert parse_float("42") == 42.0


def test_parse_float_decimal_string():
    assert parse_float("3.14") == 3.14


def test_parse_float_with_whitespace():
    assert parse_float("  12.5  ") == 12.5


def test_parse_float_empty_string():
    assert parse_float("") is None


def test_parse_float_whitespace_only():
    assert parse_float("   ") is None


def test_parse_float_none():
    assert parse_float(None) is None


def test_parse_float_non_numeric():
    assert parse_float("n/a") is None


def test_parse_float_negative():
    assert parse_float("-99.9") == -99.9


# ---------------------------------------------------------------------------
# ioda_severity
# ---------------------------------------------------------------------------

def test_ioda_severity_zero_score():
    # log10(max(1,0)) = log10(1) = 0 → severity = 0
    result = ioda_severity(0)
    assert result == 0.0


def test_ioda_severity_one():
    # log10(1) = 0 → severity = 0
    result = ioda_severity(1)
    assert result == 0.0


def test_ioda_severity_mid():
    score = 1_000_000  # 10^6
    expected = (6 / 12) * 100  # 50.0
    result = ioda_severity(score)
    assert abs(result - expected) < 1e-9


def test_ioda_severity_max_clamp():
    # Very large score should clamp to 100
    result = ioda_severity(10 ** 15)
    assert result == 100.0


def test_ioda_severity_below_zero_clamp():
    # score < 1 → same as score=1 → 0.0
    result = ioda_severity(-500)
    assert result == 0.0


def test_ioda_severity_threshold_1000():
    # min threshold used in IODA loop is 1000 — verify severity is non-zero
    result = ioda_severity(1000)
    assert result > 0.0


# ---------------------------------------------------------------------------
# cable-country topology helpers
# ---------------------------------------------------------------------------


def test_extract_station_country_uses_last_token():
    assert extract_station_country("Alpha Landing, Country A") == "Country A"


def test_normalize_country_label_strips_case_and_punctuation():
    assert normalize_country_label("Côte d'Ivoire") == "côte d ivoire"


def test_build_cable_country_index_links_endpoint_countries():
    stations_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-0.4, 0.0]},
                "properties": {"name": "Alpha Landing, Country A"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [0.4, 0.0]},
                "properties": {"name": "Beta Landing, Country B"},
            },
        ],
    }
    cables_geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-0.4, 0.0], [0.0, 0.0], [0.4, 0.0]],
                },
                "properties": {"id": "a-b-cable", "name": "A-B Cable"},
            }
        ],
    }

    index = build_cable_country_index(cables_geojson, stations_geojson)

    assert sorted(index["cables"]["a-b-cable"]["countries"]) == [
        "country a",
        "country b",
    ]
    assert index["countries"]["country a"]["cable_ids"] == ["a-b-cable"]
    assert index["countries"]["country b"]["cable_ids"] == ["a-b-cable"]
