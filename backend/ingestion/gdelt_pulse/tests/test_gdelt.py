"""Unit tests for GDELTPulseService CSV parsing logic."""
import sys
import os
import csv
import io
import json
import zipfile
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Stub heavy runtime dependencies before importing the service
_aiokafka_stub = MagicMock()
_aiokafka_stub.AIOKafkaProducer = MagicMock
sys.modules.setdefault("aiokafka", _aiokafka_stub)

_tenacity_stub = MagicMock()
_tenacity_stub.retry = lambda **kw: (lambda f: f)
_tenacity_stub.wait_exponential = MagicMock(return_value=None)
_tenacity_stub.stop_after_attempt = MagicMock(return_value=None)
sys.modules.setdefault("tenacity", _tenacity_stub)

from service import GDELTPulseService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run(coro):
    return asyncio.run(coro)


def _make_tsv_row(overrides: dict | None = None) -> list[str]:
    """
    Build a 62-column GDELT TSV row.
    Column indices that matter:
      0  GlobalEventID
      1  SQLDATE
      6  Actor1Name
      7  Actor1CountryCode
      16 Actor2Name
      17 Actor2CountryCode
      26 EventCode
      28 EventRootCode
      29 QuadClass
      30 GoldsteinScale
      31 NumMentions
      32 NumSources
      33 NumArticles
      34 AvgTone
      40 Actor1Geo_Lat
      41 Actor1Geo_Long
      -1 SOURCEURL
    """
    row = [""] * 62
    defaults = {
        0: "123456789",
        1: "20260323",
        6: "UNITED STATES",
        7: "USA",
        16: "RUSSIA",
        17: "RUS",
        26: "190",
        28: "19",
        29: "4",
        30: "-8.0",
        31: "5",
        32: "3",
        33: "3",
        34: "-2.5",
        40: "45.5152",
        41: "-122.6784",
        61: "https://example.com/article",
    }
    if overrides:
        defaults.update(overrides)
    for idx, val in defaults.items():
        row[idx] = str(val)
    return row


def _build_zip(rows: list[list[str]]) -> bytes:
    """Pack rows into a GDELT-style zip containing a single TSV file."""
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter="\t")
    for row in rows:
        writer.writerow(row)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as zf:
        zf.writestr("20260323120000.export.CSV", buf.getvalue())
    return zip_buf.getvalue()


def make_service():
    svc = GDELTPulseService()
    svc.session = MagicMock()
    svc.producer = AsyncMock()
    svc.producer.send_and_wait = AsyncMock()
    return svc


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_fetch_and_parse_publishes_valid_row():
    """A well-formed TSV row should produce exactly one published Kafka message."""
    svc = make_service()
    zip_data = _build_zip([_make_tsv_row()])

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.read = AsyncMock(return_value=zip_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_called_once()
    call_args = svc.producer.send_and_wait.call_args
    assert call_args[0][0] == "gdelt_raw"
    msg = json.loads(call_args[0][1].decode("utf-8"))
    assert msg["event_id"] == "123456789"
    assert msg["lat"] == 45.5152
    assert msg["lon"] == -122.6784
    assert msg["goldstein"] == -8.0
    assert msg["tone"] == -2.5
    assert msg["actor1"] == "UNITED STATES"


def test_fetch_and_parse_skips_short_rows():
    """Rows with fewer than 42 columns must be silently skipped."""
    svc = make_service()
    short_row = ["data"] * 20  # Only 20 columns — too short
    zip_data = _build_zip([short_row])

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.read = AsyncMock(return_value=zip_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_skips_empty_lat_lon():
    """Rows with missing lat/lon should not produce a published event."""
    svc = make_service()
    row = _make_tsv_row({40: "", 41: ""})
    zip_data = _build_zip([row])

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.read = AsyncMock(return_value=zip_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_skips_invalid_lat_lon():
    """Rows with non-numeric lat/lon should be skipped without raising."""
    svc = make_service()
    row = _make_tsv_row({40: "not_a_number", 41: "also_bad"})
    zip_data = _build_zip([row])

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.read = AsyncMock(return_value=zip_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_enriched_fields():
    """Published message should include enriched fields: actor2, countries, event codes, etc."""
    svc = make_service()
    zip_data = _build_zip([_make_tsv_row()])

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.read = AsyncMock(return_value=zip_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    call_args = svc.producer.send_and_wait.call_args
    msg = json.loads(call_args[0][1].decode("utf-8"))

    assert msg["actor2"] == "RUSSIA"
    assert msg["actor1_country"] == "USA"
    assert msg["actor2_country"] == "RUS"
    assert msg["event_code"] == "190"
    assert msg["event_root_code"] == "19"
    assert msg["quad_class"] == 4
    assert msg["num_mentions"] == 5
    assert msg["num_sources"] == 3
    assert msg["num_articles"] == 3
    assert msg["event_date"] == "20260323"
    assert msg["dataSource"] == "GDELT"


def test_fetch_and_parse_multiple_rows():
    """Multiple valid rows should each produce one Kafka message."""
    svc = make_service()
    rows = [
        _make_tsv_row({0: "111", 40: "10.0", 41: "20.0"}),
        _make_tsv_row({0: "222", 40: "30.0", 41: "40.0"}),
        _make_tsv_row({0: "333", 40: "50.0", 41: "60.0"}),
    ]
    zip_data = _build_zip(rows)

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.read = AsyncMock(return_value=zip_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    assert svc.producer.send_and_wait.call_count == 3


def test_fetch_and_parse_returns_early_on_http_error():
    """A non-200 HTTP response should not produce any published events."""
    svc = make_service()

    mock_response = AsyncMock()
    mock_response.status = 404
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/missing.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_handles_missing_optional_fields():
    """Rows with blank optional numeric fields should produce valid records with defaults."""
    svc = make_service()
    row = _make_tsv_row({30: "", 34: "", 31: "", 32: "", 33: "", 1: ""})
    zip_data = _build_zip([row])

    mock_response = AsyncMock()
    mock_response.status = 200
    mock_response.read = AsyncMock(return_value=zip_data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    svc.session.get = MagicMock(return_value=mock_response)

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_called_once()
    call_args = svc.producer.send_and_wait.call_args
    msg = json.loads(call_args[0][1].decode("utf-8"))
    assert msg["goldstein"] == 0.0
    assert msg["tone"] == 0.0
    assert msg["num_mentions"] is None
    assert msg["event_date"] is None
