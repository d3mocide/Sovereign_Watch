"""Unit tests for GDELTPulseService CSV parsing and ReliefWeb ingestion."""
import sys
import os
import csv
import io
import json
import zipfile
from unittest.mock import AsyncMock, MagicMock
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

from service import GDELTPulseService  # noqa: E402
import service as svc_mod  # noqa: E402  (for patching module-level constants)


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


def _make_get_mock(status: int = 200, data: bytes = b"") -> MagicMock:
    """Return a mock context-manager response for session.get."""
    mock_response = AsyncMock()
    mock_response.status = status
    mock_response.read = AsyncMock(return_value=data)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)
    return mock_response


def _make_post_mock(status: int = 200, body: dict | None = None) -> MagicMock:
    """Return a mock context-manager response for session.post."""
    mock_response = AsyncMock()
    mock_response.status = status
    mock_response.json = AsyncMock(return_value=body or {})
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)
    return mock_response


# ---------------------------------------------------------------------------
# GDELT CSV parsing tests
# ---------------------------------------------------------------------------

def test_fetch_and_parse_publishes_valid_row():
    """A well-formed TSV row should produce exactly one published Kafka message."""
    svc = make_service()
    zip_data = _build_zip([_make_tsv_row()])

    svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))

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

    svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_skips_empty_lat_lon():
    """Rows with missing lat/lon should not produce a published event."""
    svc = make_service()
    row = _make_tsv_row({40: "", 41: ""})
    zip_data = _build_zip([row])

    svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_skips_invalid_lat_lon():
    """Rows with non-numeric lat/lon should be skipped without raising."""
    svc = make_service()
    row = _make_tsv_row({40: "not_a_number", 41: "also_bad"})
    zip_data = _build_zip([row])

    svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_enriched_fields():
    """Published message should include enriched fields: actor2, countries, event codes, etc."""
    svc = make_service()
    zip_data = _build_zip([_make_tsv_row()])

    svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))

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

    svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    assert svc.producer.send_and_wait.call_count == 3


def test_fetch_and_parse_returns_early_on_http_error():
    """A non-200 HTTP response should not produce any published events."""
    svc = make_service()

    svc.session.get = MagicMock(return_value=_make_get_mock(404))

    run(svc.fetch_and_parse("http://fake/missing.zip"))

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_and_parse_handles_missing_optional_fields():
    """Rows with blank optional numeric fields should produce valid records with defaults."""
    svc = make_service()
    row = _make_tsv_row({30: "", 34: "", 31: "", 32: "", 33: "", 1: ""})
    zip_data = _build_zip([row])

    svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))

    run(svc.fetch_and_parse("http://fake/20260323.zip"))

    svc.producer.send_and_wait.assert_called_once()
    call_args = svc.producer.send_and_wait.call_args
    msg = json.loads(call_args[0][1].decode("utf-8"))
    assert msg["goldstein"] == 0.0
    assert msg["tone"] == 0.0
    assert msg["num_mentions"] is None
    assert msg["event_date"] is None


# ---------------------------------------------------------------------------
# GDELT conflict-only filter tests
# ---------------------------------------------------------------------------

def test_gdelt_conflict_filter_blocks_cooperation():
    """QuadClass 1 (VerbalCoop) must be dropped when GDELT_CONFLICT_ONLY is enabled."""
    original = svc_mod.GDELT_CONFLICT_ONLY
    svc_mod.GDELT_CONFLICT_ONLY = True
    try:
        svc = make_service()
        # quad_class=1 is VerbalCoop — should be filtered
        row = _make_tsv_row({29: "1"})
        zip_data = _build_zip([row])
        svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))
        run(svc.fetch_and_parse("http://fake/20260323.zip"))
        svc.producer.send_and_wait.assert_not_called()
    finally:
        svc_mod.GDELT_CONFLICT_ONLY = original


def test_gdelt_conflict_filter_blocks_material_cooperation():
    """QuadClass 2 (MaterialCoop) must be dropped when GDELT_CONFLICT_ONLY is enabled."""
    original = svc_mod.GDELT_CONFLICT_ONLY
    svc_mod.GDELT_CONFLICT_ONLY = True
    try:
        svc = make_service()
        row = _make_tsv_row({29: "2"})
        zip_data = _build_zip([row])
        svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))
        run(svc.fetch_and_parse("http://fake/20260323.zip"))
        svc.producer.send_and_wait.assert_not_called()
    finally:
        svc_mod.GDELT_CONFLICT_ONLY = original


def test_gdelt_conflict_filter_allows_verbal_conflict():
    """QuadClass 3 (VerbalConflict) must pass through the conflict filter."""
    original = svc_mod.GDELT_CONFLICT_ONLY
    svc_mod.GDELT_CONFLICT_ONLY = True
    try:
        svc = make_service()
        row = _make_tsv_row({29: "3"})
        zip_data = _build_zip([row])
        svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))
        run(svc.fetch_and_parse("http://fake/20260323.zip"))
        svc.producer.send_and_wait.assert_called_once()
        msg = json.loads(svc.producer.send_and_wait.call_args[0][1].decode())
        assert msg["quad_class"] == 3
    finally:
        svc_mod.GDELT_CONFLICT_ONLY = original


def test_gdelt_conflict_filter_disabled_passes_all_quad_classes():
    """When GDELT_CONFLICT_ONLY is false, cooperative events must also be published."""
    original = svc_mod.GDELT_CONFLICT_ONLY
    svc_mod.GDELT_CONFLICT_ONLY = False
    try:
        svc = make_service()
        rows = [
            _make_tsv_row({0: "1", 29: "1"}),  # VerbalCoop
            _make_tsv_row({0: "2", 29: "2"}),  # MaterialCoop
            _make_tsv_row({0: "3", 29: "3"}),  # VerbalConflict
            _make_tsv_row({0: "4", 29: "4"}),  # MaterialConflict
        ]
        zip_data = _build_zip(rows)
        svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))
        run(svc.fetch_and_parse("http://fake/20260323.zip"))
        assert svc.producer.send_and_wait.call_count == 4
    finally:
        svc_mod.GDELT_CONFLICT_ONLY = original


def test_gdelt_conflict_filter_drops_missing_quad_class():
    """Events with no QuadClass value must be filtered when conflict-only is enabled."""
    original = svc_mod.GDELT_CONFLICT_ONLY
    svc_mod.GDELT_CONFLICT_ONLY = True
    try:
        svc = make_service()
        row = _make_tsv_row({29: ""})  # blank QuadClass → None
        zip_data = _build_zip([row])
        svc.session.get = MagicMock(return_value=_make_get_mock(200, zip_data))
        run(svc.fetch_and_parse("http://fake/20260323.zip"))
        svc.producer.send_and_wait.assert_not_called()
    finally:
        svc_mod.GDELT_CONFLICT_ONLY = original


# ---------------------------------------------------------------------------
# ReliefWeb ingestion tests
# ---------------------------------------------------------------------------

def _make_rw_body(disasters: list[dict] | None = None) -> dict:
    """Build a minimal ReliefWeb API response body."""
    if disasters is None:
        disasters = [
            {
                "id": "42",
                "fields": {
                    "name": "Syria Crisis",
                    "status": "current",
                    "url": "https://reliefweb.int/disaster/42",
                    "type": [{"name": "Conflict and Violence"}],
                    "date": {"created": "2026-03-01T00:00:00+00:00"},
                    "country": [
                        {
                            "name": "Syrian Arab Republic",
                            "iso3": "SYR",
                            "location": {"lat": 34.802, "lon": 38.996},
                        }
                    ],
                },
            }
        ]
    return {"data": disasters}


def test_fetch_reliefweb_publishes_event():
    """A well-formed ReliefWeb disaster should produce one Kafka message per country."""
    svc = make_service()
    svc.session.post = MagicMock(return_value=_make_post_mock(200, _make_rw_body()))

    run(svc.fetch_reliefweb())

    svc.producer.send_and_wait.assert_called_once()
    call_args = svc.producer.send_and_wait.call_args
    assert call_args[0][0] == "gdelt_raw"
    msg = json.loads(call_args[0][1].decode("utf-8"))

    assert msg["event_id"] == "rw-42-SYR"
    assert msg["lat"] == 34.802
    assert msg["lon"] == 38.996
    assert msg["headline"] == "Syria Crisis"
    assert msg["actor1"] == "Syrian Arab Republic"
    assert msg["actor1_country"] == "SYR"
    assert msg["event_code"] == "Conflict and Violence"
    assert msg["goldstein"] == -8.0
    assert msg["dataSource"] == "ReliefWeb"
    assert msg["event_date"] == "20260301"
    assert msg["tone"] is None


def test_fetch_reliefweb_multi_country_emits_one_event_each():
    """A disaster affecting two countries should emit two separate Kafka messages."""
    svc = make_service()
    body = _make_rw_body([
        {
            "id": "99",
            "fields": {
                "name": "Sahel Famine",
                "status": "current",
                "url": "https://reliefweb.int/disaster/99",
                "type": [{"name": "Famine"}],
                "date": {"created": "2026-01-15T00:00:00+00:00"},
                "country": [
                    {"name": "Mali", "iso3": "MLI", "location": {"lat": 17.0, "lon": -4.0}},
                    {"name": "Niger", "iso3": "NER", "location": {"lat": 17.6, "lon": 8.1}},
                ],
            },
        }
    ])
    svc.session.post = MagicMock(return_value=_make_post_mock(200, body))

    run(svc.fetch_reliefweb())

    assert svc.producer.send_and_wait.call_count == 2
    ids = {
        json.loads(c[0][1].decode())["event_id"]
        for c in svc.producer.send_and_wait.call_args_list
    }
    assert ids == {"rw-99-MLI", "rw-99-NER"}


def test_fetch_reliefweb_skips_country_without_location():
    """Countries that lack a location block must be silently skipped."""
    svc = make_service()
    body = _make_rw_body([
        {
            "id": "7",
            "fields": {
                "name": "No-Location Disaster",
                "status": "current",
                "url": "https://reliefweb.int/disaster/7",
                "type": [{"name": "Flood"}],
                "date": {"created": "2026-02-01T00:00:00+00:00"},
                "country": [
                    {"name": "Nowhere", "iso3": "NOW"},  # no "location" key
                ],
            },
        }
    ])
    svc.session.post = MagicMock(return_value=_make_post_mock(200, body))

    run(svc.fetch_reliefweb())

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_reliefweb_skips_disaster_without_countries():
    """Disasters with an empty country list must not produce any Kafka messages."""
    svc = make_service()
    body = _make_rw_body([
        {
            "id": "8",
            "fields": {
                "name": "Orphan Disaster",
                "status": "alert",
                "url": "https://reliefweb.int/disaster/8",
                "type": [{"name": "Earthquake"}],
                "date": {"created": "2026-02-10T00:00:00+00:00"},
                "country": [],
            },
        }
    ])
    svc.session.post = MagicMock(return_value=_make_post_mock(200, body))

    run(svc.fetch_reliefweb())

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_reliefweb_returns_early_on_http_error():
    """A non-200 response from ReliefWeb must not produce any Kafka messages."""
    svc = make_service()
    svc.session.post = MagicMock(return_value=_make_post_mock(503))

    run(svc.fetch_reliefweb())

    svc.producer.send_and_wait.assert_not_called()


def test_fetch_reliefweb_goldstein_unknown_type():
    """Unknown disaster types should use the default Goldstein fallback."""
    svc = make_service()
    body = _make_rw_body([
        {
            "id": "55",
            "fields": {
                "name": "Mystery Event",
                "status": "current",
                "url": "https://reliefweb.int/disaster/55",
                "type": [{"name": "Space Weather"}],  # not in the mapping
                "date": {"created": "2026-03-10T00:00:00+00:00"},
                "country": [
                    {"name": "Canada", "iso3": "CAN", "location": {"lat": 60.0, "lon": -95.0}}
                ],
            },
        }
    ])
    svc.session.post = MagicMock(return_value=_make_post_mock(200, body))

    run(svc.fetch_reliefweb())

    svc.producer.send_and_wait.assert_called_once()
    msg = json.loads(svc.producer.send_and_wait.call_args[0][1].decode())
    assert msg["goldstein"] == svc_mod._DEFAULT_RELIEFWEB_GOLDSTEIN


def test_fetch_reliefweb_empty_data_list():
    """An empty data array must not crash or publish any events."""
    svc = make_service()
    svc.session.post = MagicMock(return_value=_make_post_mock(200, {"data": []}))

    run(svc.fetch_reliefweb())

    svc.producer.send_and_wait.assert_not_called()
