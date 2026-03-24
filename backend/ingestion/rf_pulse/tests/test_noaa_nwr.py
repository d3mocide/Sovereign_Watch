
"""Unit tests for NOAANWRSource JS parsing and normalisation logic."""
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sources.noaa_nwr import NOAANWRSource


# ---------------------------------------------------------------------------
# Sample NOAA NWR JS content mimicking CCL.js structure
# ---------------------------------------------------------------------------
_SAMPLE_JS = """
SITENAME[0] = "Portland OR";
CALLSIGN[0] = "WXL79";
FREQ[0] = "162.550";
LAT[0] = "45.5152";
LON[0] = "-122.6784";
STATUS[0] = "On-air";
SITESTATE[0] = "OR";
SITELOC[0] = "Portland";

SITENAME[1] = "Seattle WA";
CALLSIGN[1] = "WXK48";
FREQ[1] = "162.400";
LAT[1] = "47.6062";
LON[1] = "-122.3321";
STATUS[1] = "On-air";
SITESTATE[1] = "WA";
SITELOC[1] = "Seattle";

SITENAME[2] = "Duplicate Portland";
CALLSIGN[2] = "WXL79";
FREQ[2] = "162.550";
LAT[2] = "45.5200";
LON[2] = "-122.6900";
STATUS[2] = "On-air";
SITESTATE[2] = "OR";
SITELOC[2] = "Portland";
"""

_SAMPLE_JS_ZERO_COORDS = """
SITENAME[0] = "Bad Station";
CALLSIGN[0] = "WXX00";
FREQ[0] = "162.550";
LAT[0] = "0";
LON[0] = "0";
STATUS[0] = "On-air";
SITESTATE[0] = "XX";
SITELOC[0] = "Unknown";
"""


def make_source():
    """Return a NOAANWRSource with stub dependencies."""
    return NOAANWRSource(
        producer=None,
        redis_client=None,
        topic="rf_sites",
        fetch_interval_h=24,
    )


def run(coro):
    return asyncio.run(coro)


def test_fetch_and_publish_publishes_unique_callsigns():
    """Verifies that duplicate callsigns are deduplicated and correct records published."""
    src = make_source()
    published = []

    mock_producer = MagicMock()
    mock_producer.send = AsyncMock(side_effect=lambda topic, value: published.append(value))
    src.producer = mock_producer

    mock_response = AsyncMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.text = AsyncMock(return_value=_SAMPLE_JS)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    mock_client = AsyncMock()
    mock_client.get = MagicMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("sources.noaa_nwr.aiohttp.ClientSession", return_value=mock_client):
        run(src._fetch_and_publish())

    # WXL79 appears twice — should only be published once
    callsigns = [r["callsign"] for r in published]
    assert callsigns.count("WXL79") == 1
    assert "WXK48" in callsigns
    assert len(published) == 2


def test_fetch_and_publish_record_structure():
    """Verifies the structure of a published NOAA NWR record."""
    src = make_source()
    published = []

    mock_producer = MagicMock()
    mock_producer.send = AsyncMock(side_effect=lambda topic, value: published.append(value))
    src.producer = mock_producer

    mock_response = AsyncMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.text = AsyncMock(return_value=_SAMPLE_JS)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    mock_client = AsyncMock()
    mock_client.get = MagicMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("sources.noaa_nwr.aiohttp.ClientSession", return_value=mock_client):
        run(src._fetch_and_publish())

    portland = next(r for r in published if r["callsign"] == "WXL79")
    assert portland["source"] == "noaa_nwr"
    assert portland["site_id"] == "noaa:WXL79"
    assert portland["service"] == "noaa_nwr"
    assert portland["lat"] == 45.5152
    assert portland["lon"] == -122.6784
    assert portland["output_freq"] == 162.550
    assert portland["state"] == "OR"
    assert portland["city"] == "Portland"
    assert portland["country"] == "US"
    assert portland["use_access"] == "OPEN"
    assert "FM Analog" in portland["modes"]


def test_fetch_and_publish_skips_zero_coordinates():
    """Verifies that stations with zero lat/lon are not published."""
    src = make_source()
    published = []

    mock_producer = MagicMock()
    mock_producer.send = AsyncMock(side_effect=lambda topic, value: published.append(value))
    src.producer = mock_producer

    mock_response = AsyncMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.text = AsyncMock(return_value=_SAMPLE_JS_ZERO_COORDS)
    mock_response.__aenter__ = AsyncMock(return_value=mock_response)
    mock_response.__aexit__ = AsyncMock(return_value=False)

    mock_client = AsyncMock()
    mock_client.get = MagicMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("sources.noaa_nwr.aiohttp.ClientSession", return_value=mock_client):
        run(src._fetch_and_publish())

    assert len(published) == 0
