"""Unit tests for InfraPoller pure helper functions."""
import struct
import sys
import os
import unittest.mock as mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import (
    DNS_ROOT_SERVERS,
    build_cable_country_index,
    dms_to_decimal,
    extract_station_country,
    ioda_severity,
    normalize_country_label,
    parse_float,
    _probe_dns_sync,
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


# ---------------------------------------------------------------------------
# DNS_ROOT_SERVERS static data
# ---------------------------------------------------------------------------

def test_dns_root_servers_count():
    assert len(DNS_ROOT_SERVERS) == 13


def test_dns_root_servers_letters():
    letters = [s["letter"] for s in DNS_ROOT_SERVERS]
    assert letters == list("ABCDEFGHIJKLM")


def test_dns_root_servers_have_coords():
    for srv in DNS_ROOT_SERVERS:
        assert -90.0 <= srv["lat"] <= 90.0, f"{srv['letter']} bad lat"
        assert -180.0 <= srv["lon"] <= 180.0, f"{srv['letter']} bad lon"


def test_dns_root_servers_have_valid_ips():
    import ipaddress
    for srv in DNS_ROOT_SERVERS:
        ipaddress.IPv4Address(srv["ip"])  # raises if invalid


# ---------------------------------------------------------------------------
# _probe_dns_sync — mocked socket
# ---------------------------------------------------------------------------

def _make_valid_dns_response() -> bytes:
    """Minimal DNS response: ID=1, QR+AA bits set, rest zeroed."""
    # Flags: 0x8400 = QR(1) + AA(1) + OPCODE(0) + ...
    return struct.pack(">HHHHHH", 1, 0x8400, 0, 1, 0, 0)


def test_probe_dns_sync_reachable():
    response = _make_valid_dns_response()
    mock_sock = mock.MagicMock()
    mock_sock.recv.return_value = response

    with mock.patch("main.socket.socket", return_value=mock_sock):
        reachable, latency_ms = _probe_dns_sync("198.41.0.4")

    assert reachable is True
    assert latency_ms >= 0.0


def test_probe_dns_sync_timeout_returns_unreachable():
    mock_sock = mock.MagicMock()
    mock_sock.sendto.side_effect = OSError("timed out")

    with mock.patch("main.socket.socket", return_value=mock_sock):
        reachable, latency_ms = _probe_dns_sync("198.41.0.4")

    assert reachable is False
    assert latency_ms == -1.0


def test_probe_dns_sync_bad_response_id_returns_false():
    # Response with wrong QID (2 instead of 1) — should return False
    bad_response = struct.pack(">HHHHHH", 2, 0x8400, 0, 1, 0, 0)
    mock_sock = mock.MagicMock()
    mock_sock.recv.return_value = bad_response

    with mock.patch("main.socket.socket", return_value=mock_sock):
        reachable, latency_ms = _probe_dns_sync("198.41.0.4")

    assert reachable is False


def test_probe_dns_sync_socket_closed_on_error():
    mock_sock = mock.MagicMock()
    mock_sock.sendto.side_effect = OSError("network unreachable")

    with mock.patch("main.socket.socket", return_value=mock_sock):
        _probe_dns_sync("198.41.0.4")

    mock_sock.close.assert_called()



