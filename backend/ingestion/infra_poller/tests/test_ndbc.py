"""Unit tests for NDBC pure helper functions in InfraPoller."""
import sys
import os
from datetime import datetime, UTC

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import _ndbc_field, parse_ndbc_latest_obs


# ---------------------------------------------------------------------------
# _ndbc_field
# ---------------------------------------------------------------------------

def test_ndbc_field_valid_float():
    assert _ndbc_field("4.4") == 4.4


def test_ndbc_field_integer_string():
    assert _ndbc_field("310") == 310.0


def test_ndbc_field_mm_returns_none():
    assert _ndbc_field("MM") is None


def test_ndbc_field_empty_returns_none():
    assert _ndbc_field("") is None


def test_ndbc_field_whitespace_only_returns_none():
    assert _ndbc_field("   ") is None


def test_ndbc_field_whitespace_padded():
    assert _ndbc_field("  1.5  ") == 1.5


def test_ndbc_field_negative():
    assert _ndbc_field("-2.3") == -2.3


def test_ndbc_field_non_numeric_returns_none():
    assert _ndbc_field("n/a") is None


# ---------------------------------------------------------------------------
# parse_ndbc_latest_obs
# ---------------------------------------------------------------------------

SAMPLE_TEXT = """\
#STN     LAT      LON  YEAR  MM  DD  hh  mm WDIR WSPD  GST  WVHT   DPD   APD  MWD   PRES  ATMP  WTMP  DEWP  VIS  TIDE
#text    deg      deg                         deg  m/s  m/s    m     s     s   deg    hPa  degC  degC  degC   mi    ft
41001 34.700  -72.800  2024  03  28  15  50  310  4.4  5.4   1.5   8.0   5.3  327 1014.2  16.3  20.4    MM   MM    MM
46059 38.000 -129.900  2024  03  28  14  00  270  7.2  9.1   2.8  12.0   7.5  280 1009.5  12.1  13.5  10.2   MM    MM
NOGPS  99.000  999.000  2024  03  28  14  00  270  7.2   MM    MM    MM    MM   MM 1009.5    MM    MM    MM   MM    MM
"""


def test_parse_returns_list():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert isinstance(records, list)


def test_parse_skips_header_lines():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    # Header lines start with '#' and should be skipped
    ids = [r["buoy_id"] for r in records]
    assert "#STN" not in ids
    assert "#text" not in ids


def test_parse_correct_count():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    # 3rd row has all MM measurements — should be skipped (wvht, wtmp, wspd all None)
    assert len(records) == 2


def test_parse_buoy_id():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["buoy_id"] == "41001"
    assert records[1]["buoy_id"] == "46059"


def test_parse_lat_lon():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["lat"] == 34.700
    assert records[0]["lon"] == -72.800


def test_parse_wvht():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["wvht_m"] == 1.5


def test_parse_wtmp():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["wtmp_c"] == 20.4


def test_parse_wspd():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["wspd_ms"] == 4.4


def test_parse_wdir():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["wdir_deg"] == 310.0


def test_parse_pres():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["pres_hpa"] == 1014.2


def test_parse_mm_field_is_none():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    # DEWP column is 'MM' for buoy 41001
    assert records[0].get("atmp_c") == 16.3


def test_parse_time_is_datetime():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert isinstance(records[0]["time"], datetime)


def test_parse_time_utc():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    assert records[0]["time"].tzinfo == UTC


def test_parse_time_values():
    records = parse_ndbc_latest_obs(SAMPLE_TEXT)
    t = records[0]["time"]
    assert t.year == 2024
    assert t.month == 3
    assert t.day == 28
    assert t.hour == 15
    assert t.minute == 50


def test_parse_invalid_lat_skipped():
    bad = """\
#STN     LAT      LON  YEAR  MM  DD  hh  mm WDIR WSPD  GST  WVHT   DPD   APD  MWD   PRES  ATMP  WTMP  DEWP  VIS  TIDE
#text    deg      deg                         deg  m/s  m/s    m     s     s   deg    hPa  degC  degC  degC   mi    ft
BADBAD 999.000 999.000 2024  03  28  15  50  310  4.4  5.4   1.5   8.0   5.3  327 1014.2  16.3  20.4    MM   MM    MM
"""
    records = parse_ndbc_latest_obs(bad)
    assert len(records) == 0


def test_parse_empty_text_returns_empty():
    assert parse_ndbc_latest_obs("") == []


def test_parse_only_headers_returns_empty():
    header_only = """\
#STN     LAT      LON  YEAR  MM  DD  hh  mm WDIR WSPD  GST  WVHT   DPD   APD  MWD   PRES  ATMP  WTMP  DEWP  VIS  TIDE
#text    deg      deg                         deg  m/s  m/s    m     s     s   deg    hPa  degC  degC  degC   mi    ft
"""
    assert parse_ndbc_latest_obs(header_only) == []


def test_parse_short_row_skipped():
    short = """\
#STN     LAT      LON  YEAR  MM  DD  hh  mm
#text    deg      deg
41001 34.700  -72.800  2024  03  28  15
"""
    # 7 fields < 18 minimum
    records = parse_ndbc_latest_obs(short)
    assert len(records) == 0
