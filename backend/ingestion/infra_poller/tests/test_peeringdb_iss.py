"""Unit tests for PeeringDB pure helper functions in InfraPoller."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import (
    build_peeringdb_facility_location_index,
    enrich_peeringdb_ixps_with_facility_locations,
    parse_peeringdb_ixps,
    parse_peeringdb_facilities,
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

SAMPLE_IXP_RESPONSE = {
    "data": [
        {
            "id": 1,
            "name": "AMS-IX",
            "name_long": "Amsterdam Internet Exchange",
            "city": "Amsterdam",
            "country": "NL",
            "website": "https://www.ams-ix.net",
            "lat": 52.3740,
            "lon": 4.8897,
        },
        {
            "id": 2,
            "name": "DE-CIX Frankfurt",
            "name_long": "Deutscher Commercial Internet Exchange",
            "city": "Frankfurt",
            "country": "DE",
            "website": "https://www.de-cix.net",
            "lat": 50.1109,
            "lon": 8.6821,
        },
        # Missing lat/lon — should be skipped
        {
            "id": 3,
            "name": "No Coords IXP",
            "city": "Nowhere",
            "country": "XX",
            "lat": None,
            "lon": None,
        },
        # Out-of-range coordinates — should be skipped
        {
            "id": 4,
            "name": "Bad Coords IXP",
            "city": "Badplace",
            "country": "XX",
            "lat": 999.0,
            "lon": 999.0,
        },
        # Empty name — should be skipped
        {
            "id": 5,
            "name": "",
            "city": "Empty",
            "country": "XX",
            "lat": 10.0,
            "lon": 20.0,
        },
        # Zero coordinates (e.g. Gulf of Guinea) — must NOT be skipped
        {
            "id": 6,
            "name": "Null Island IXP",
            "city": "Null Island",
            "country": "XX",
            "lat": 0.0,
            "lon": 0.0,
        },
    ]
}

SAMPLE_FAC_RESPONSE = {
    "data": [
        {
            "id": 100,
            "name": "Equinix AM1",
            "city": "Amsterdam",
            "country": "NL",
            "website": "https://www.equinix.com",
            "org": {"name": "Equinix"},
            "lat": 52.3740,
            "lon": 4.8897,
        },
        {
            "id": 101,
            "name": "Digital Realty ATL",
            "city": "Atlanta",
            "country": "US",
            "website": "https://www.digitalrealty.com",
            "org": {"name": "Digital Realty"},
            "lat": 33.7490,
            "lon": -84.3880,
        },
        # No lat/lon — skipped
        {
            "id": 102,
            "name": "Phantom DC",
            "city": "Ghost",
            "country": "XX",
            "lat": None,
            "lon": None,
        },
        # Zero coordinates — must NOT be skipped
        {
            "id": 103,
            "name": "Zero Coord DC",
            "city": "Null Island",
            "country": "XX",
            "lat": 0.0,
            "lon": 0.0,
        },
    ]
}


# ---------------------------------------------------------------------------
# parse_peeringdb_ixps
# ---------------------------------------------------------------------------

def test_parse_ixps_returns_list():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    assert isinstance(result, list)


def test_parse_ixps_valid_count():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    # Records 3 (no coords), 4 (out-of-range), 5 (empty name) should be skipped;
    # record 6 (0.0, 0.0) is valid and must be included.
    assert len(result) == 3


def test_parse_ixps_ids():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ids = [r["ixp_id"] for r in result]
    assert 1 in ids
    assert 2 in ids


def test_parse_ixps_name():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    assert result[0]["name"] == "AMS-IX"


def test_parse_ixps_name_long():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    assert result[0]["name_long"] == "Amsterdam Internet Exchange"


def test_parse_ixps_coords():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ams = next(r for r in result if r["ixp_id"] == 1)
    assert abs(ams["lat"] - 52.374) < 0.001
    assert abs(ams["lon"] - 4.8897) < 0.001


def test_parse_ixps_country():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ams = next(r for r in result if r["ixp_id"] == 1)
    assert ams["country"] == "NL"


def test_parse_ixps_website():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ams = next(r for r in result if r["ixp_id"] == 1)
    assert ams["website"] == "https://www.ams-ix.net"


def test_parse_ixps_empty_data():
    result = parse_peeringdb_ixps({"data": []})
    assert result == []


def test_parse_ixps_missing_data_key():
    result = parse_peeringdb_ixps({})
    assert result == []


def test_parse_ixps_skips_none_lat():
    # Only the two valid records should be returned
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ixp_ids = [r["ixp_id"] for r in result]
    assert 3 not in ixp_ids


def test_parse_ixps_skips_out_of_range_coords():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ixp_ids = [r["ixp_id"] for r in result]
    assert 4 not in ixp_ids


def test_parse_ixps_skips_empty_name():
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ixp_ids = [r["ixp_id"] for r in result]
    assert 5 not in ixp_ids


def test_parse_ixps_zero_coordinates_kept():
    # 0.0 lat and 0.0 lon are valid coordinates — must not be treated as missing.
    result = parse_peeringdb_ixps(SAMPLE_IXP_RESPONSE)
    ixp_ids = [r["ixp_id"] for r in result]
    assert 6 in ixp_ids
    null_island = next(r for r in result if r["ixp_id"] == 6)
    assert null_island["lat"] == 0.0
    assert null_island["lon"] == 0.0


def test_build_peeringdb_facility_location_index_averages_city_country_centroid():
    index = build_peeringdb_facility_location_index(
        [
            {"city": "Ashburn", "country": "US", "lat": 39.0, "lon": -77.0},
            {"city": "Ashburn", "country": "US", "lat": 39.2, "lon": -77.2},
        ]
    )

    assert index[("ashburn", "us")] == (39.1, -77.1)


def test_enrich_peeringdb_ixps_with_facility_locations_fills_missing_coords():
    ixp_response = {
        "data": [
            {
                "id": 10,
                "name": "Equinix Ashburn",
                "name_long": "Equinix Internet Exchange Ashburn",
                "city": "Ashburn",
                "country": "US",
                "website": "https://ix.equinix.com",
            }
        ]
    }
    location_index = {("ashburn", "us"): (39.0438, -77.4874)}

    records = enrich_peeringdb_ixps_with_facility_locations(ixp_response, location_index)

    assert len(records) == 1
    assert records[0]["ixp_id"] == 10
    assert records[0]["lat"] == 39.0438
    assert records[0]["lon"] == -77.4874


# ---------------------------------------------------------------------------
# parse_peeringdb_facilities
# ---------------------------------------------------------------------------

def test_parse_fac_returns_list():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    assert isinstance(result, list)


def test_parse_fac_valid_count():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    # Record 102 has no coords — skipped; record 103 (0.0, 0.0) is valid.
    assert len(result) == 3


def test_parse_fac_ids():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    ids = [r["fac_id"] for r in result]
    assert 100 in ids
    assert 101 in ids


def test_parse_fac_name():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    fac = next(r for r in result if r["fac_id"] == 100)
    assert fac["name"] == "Equinix AM1"


def test_parse_fac_org_name():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    fac = next(r for r in result if r["fac_id"] == 100)
    assert fac["org_name"] == "Equinix"


def test_parse_fac_coords():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    atl = next(r for r in result if r["fac_id"] == 101)
    assert abs(atl["lat"] - 33.749) < 0.001
    assert abs(atl["lon"] - (-84.388)) < 0.001


def test_parse_fac_country():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    atl = next(r for r in result if r["fac_id"] == 101)
    assert atl["country"] == "US"


def test_parse_fac_skips_no_coords():
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    ids = [r["fac_id"] for r in result]
    assert 102 not in ids


def test_parse_fac_zero_coordinates_kept():
    # 0.0 lat and 0.0 lon are valid — must not be treated as missing.
    result = parse_peeringdb_facilities(SAMPLE_FAC_RESPONSE)
    ids = [r["fac_id"] for r in result]
    assert 103 in ids
    zero = next(r for r in result if r["fac_id"] == 103)
    assert zero["lat"] == 0.0
    assert zero["lon"] == 0.0


def test_parse_fac_empty_data():
    result = parse_peeringdb_facilities({"data": []})
    assert result == []
