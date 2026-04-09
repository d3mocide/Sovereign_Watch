"""
Unit tests for the AISHub message normaliser (sources/aishub.py).

The normaliser converts AISHub JSON arrays into AISStream-compatible dicts so
that service.py can process them without any format-specific branching beyond
the initial parse call.
"""

import json
from sources.aishub import parse_messages, build_ws_url

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_VESSEL_FULL = {
    "MMSI": 123456789,
    "LATITUDE": 45.52,
    "LONGITUDE": -122.67,
    "SOG": 8.5,
    "COG": 180.0,
    "HEADING": 180,
    "NAVSTAT": 0,
    "NAME": "MY VESSEL",
    "TYPE": 70,
    "IMO": 9876543,
    "CALLSIGN": "WDE1234",
    "DRAUGHT": 5.0,
    "DEST": "PORTLAND",
    "A": 50,
    "B": 30,
    "C": 10,
    "D": 10,
}

_VESSEL_POSITION_ONLY = {
    "MMSI": 987654321,
    "LATITUDE": 48.00,
    "LONGITUDE": -124.00,
    "SOG": 0.0,
    "COG": 0.0,
    "HEADING": 511,
    "NAVSTAT": 1,
    # No NAME, TYPE, IMO, CALLSIGN, DEST
}


def _parse(vessels: list) -> list:
    return parse_messages(json.dumps(vessels))


# ---------------------------------------------------------------------------
# Tests: parse_messages
# ---------------------------------------------------------------------------

class TestParseMessages:
    def test_returns_position_report_for_full_vessel(self):
        msgs = _parse([_VESSEL_FULL])
        pos_msgs = [m for m in msgs if m["MessageType"] == "PositionReport"]
        assert len(pos_msgs) == 1

    def test_position_report_coordinates(self):
        msgs = _parse([_VESSEL_FULL])
        pos = next(m for m in msgs if m["MessageType"] == "PositionReport")
        pr = pos["Message"]["PositionReport"]
        assert pr["Latitude"] == 45.52
        assert pr["Longitude"] == -122.67

    def test_position_report_sog(self):
        msgs = _parse([_VESSEL_FULL])
        pos = next(m for m in msgs if m["MessageType"] == "PositionReport")
        pr = pos["Message"]["PositionReport"]
        assert pr["Sog"] == 8.5

    def test_position_report_nav_status(self):
        msgs = _parse([_VESSEL_FULL])
        pos = next(m for m in msgs if m["MessageType"] == "PositionReport")
        pr = pos["Message"]["PositionReport"]
        assert pr["NavigationalStatus"] == 0

    def test_position_report_heading(self):
        msgs = _parse([_VESSEL_FULL])
        pos = next(m for m in msgs if m["MessageType"] == "PositionReport")
        assert pos["Message"]["PositionReport"]["TrueHeading"] == 180

    def test_mmsi_in_metadata(self):
        msgs = _parse([_VESSEL_FULL])
        pos = next(m for m in msgs if m["MessageType"] == "PositionReport")
        assert pos["MetaData"]["MMSI"] == 123456789

    def test_returns_static_data_for_full_vessel(self):
        msgs = _parse([_VESSEL_FULL])
        static_msgs = [m for m in msgs if m["MessageType"] == "ShipStaticData"]
        assert len(static_msgs) == 1

    def test_static_data_name(self):
        msgs = _parse([_VESSEL_FULL])
        static = next(m for m in msgs if m["MessageType"] == "ShipStaticData")
        assert static["Message"]["ShipStaticData"]["Name"] == "MY VESSEL"

    def test_static_data_ship_type(self):
        msgs = _parse([_VESSEL_FULL])
        static = next(m for m in msgs if m["MessageType"] == "ShipStaticData")
        assert static["Message"]["ShipStaticData"]["Type"] == 70

    def test_static_data_imo(self):
        msgs = _parse([_VESSEL_FULL])
        static = next(m for m in msgs if m["MessageType"] == "ShipStaticData")
        assert static["Message"]["ShipStaticData"]["ImoNumber"] == 9876543

    def test_static_data_dimensions(self):
        msgs = _parse([_VESSEL_FULL])
        static = next(m for m in msgs if m["MessageType"] == "ShipStaticData")
        dim = static["Message"]["ShipStaticData"]["Dimension"]
        assert dim == {"A": 50, "B": 30, "C": 10, "D": 10}

    def test_position_only_vessel_omits_static_message(self):
        msgs = _parse([_VESSEL_POSITION_ONLY])
        assert all(m["MessageType"] != "ShipStaticData" for m in msgs)
        pos_msgs = [m for m in msgs if m["MessageType"] == "PositionReport"]
        assert len(pos_msgs) == 1

    def test_heading_not_available_sentinel(self):
        msgs = _parse([_VESSEL_POSITION_ONLY])
        pos = next(m for m in msgs if m["MessageType"] == "PositionReport")
        assert pos["Message"]["PositionReport"]["TrueHeading"] == 511

    def test_multiple_vessels(self):
        msgs = _parse([_VESSEL_FULL, _VESSEL_POSITION_ONLY])
        mmsis = {m["MetaData"]["MMSI"] for m in msgs}
        assert 123456789 in mmsis
        assert 987654321 in mmsis

    def test_non_json_frame_returns_empty(self):
        assert parse_messages("not json at all") == []

    def test_error_object_returns_empty(self):
        assert parse_messages(json.dumps({"ERROR": "Invalid username"})) == []

    def test_empty_array_returns_empty(self):
        assert parse_messages("[]") == []

    def test_vessel_missing_mmsi_skipped(self):
        vessel = dict(_VESSEL_FULL)
        del vessel["MMSI"]
        assert parse_messages(json.dumps([vessel])) == []

    def test_vessel_missing_lat_lon_skipped(self):
        vessel = {k: v for k, v in _VESSEL_FULL.items() if k not in ("LATITUDE", "LONGITUDE")}
        assert parse_messages(json.dumps([vessel])) == []


# ---------------------------------------------------------------------------
# Tests: build_ws_url
# ---------------------------------------------------------------------------

class TestBuildWsUrl:
    def test_contains_username(self):
        url = build_ws_url("myuser", 45.5, -122.7, 150)
        assert "myuser" in url

    def test_contains_format_param(self):
        url = build_ws_url("myuser", 45.5, -122.7, 150)
        assert "format=1" in url

    def test_contains_bbox_params(self):
        url = build_ws_url("myuser", 45.5, -122.7, 150)
        assert "latmin=" in url
        assert "latmax=" in url
        assert "lngmin=" in url
        assert "lngmax=" in url
