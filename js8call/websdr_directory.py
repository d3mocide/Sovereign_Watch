"""
websdr_directory.py — WebSDR public node discovery with proximity filtering.

Fetches WebSDR receiver lists from rx-tx.info (primary, has GPS coords) and
websdr.org HTML (fallback), caches results for one hour, and exposes get_nodes()
which returns proximity-sorted, frequency-filtered results.

Supplements KiwiSDR (HF 0-30 MHz) with WebSDR nodes that often cover VHF/UHF
bands (6m, 2m, 70cm, FM broadcast, aviation, marine VHF, etc.).

Designed for use with asyncio; all HTTP I/O is non-blocking via aiohttp.
"""

import asyncio
import logging
import math
import re
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger("js8bridge.websdr_dir")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# rx-tx.info has structured SDR receiver data with GPS coordinates
RXTX_INFO_URL = "https://rx-tx.info/table-sdr-points"

# websdr.org main listing — HTML, no coords, but authoritative
WEBSDR_ORG_URL = "http://websdr.org/"

CACHE_TTL = 3600        # seconds (1 hour — matches KiwiSDR pattern)
FETCH_TIMEOUT = 20      # seconds per HTTP request

# Browser-like User-Agent avoids 403 on websdr.org
_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"

# ---------------------------------------------------------------------------
# Band → frequency range mapping (kHz)
# ---------------------------------------------------------------------------

BAND_FREQ_MAP: dict[str, tuple[float, float]] = {
    # Longwave / AM / Shortwave catchalls
    "lw":      (0,          530),
    "mw":      (530,       1700),
    "sw":      (1700,     30000),
    "hf":      (0,        30000),
    # Amateur HF bands
    "160m":    (1800,      2000),
    "80m":     (3500,      4000),
    "60m":     (5330,      5405),
    "40m":     (7000,      7300),
    "30m":     (10100,    10150),
    "20m":     (14000,    14350),
    "17m":     (18068,    18168),
    "15m":     (21000,    21450),
    "12m":     (24890,    24990),
    "10m":     (28000,    29700),
    # VHF amateur
    "6m":      (50000,    54000),
    "4m":      (70000,    70500),
    "2m":      (144000,  148000),
    # UHF amateur
    "70cm":    (420000,  450000),
    "23cm":    (1240000, 1300000),
    # Broadcast / utility
    "fm":      (87500,   108000),
    "broadcast": (87500, 108000),
    "air":     (108000,  137000),
    "aviation": (108000, 137000),
    "marine":  (156000,  174000),
    "vhf":     (30000,   300000),
    "uhf":     (300000, 3000000),
}

# Well-known WebSDR nodes as a final fallback seed list.
# Covers diverse geography and frequency ranges (HF + VHF/UHF).
SEED_NODES: list[dict] = [
    {
        "url": "http://websdr.ewi.utwente.nl:8901/",
        "name": "University of Twente",
        "location": "Enschede, Netherlands",
        "lat": 52.2382, "lon": 6.8552,
        "bands": ["hf", "6m"],
    },
    {
        "url": "http://www.websdr.org:8901/",
        "name": "WebSDR.org Demo",
        "location": "Enschede, Netherlands",
        "lat": 52.2382, "lon": 6.8552,
        "bands": ["hf"],
    },
    {
        "url": "http://kfs.websdr.org:8901/",
        "name": "KFS Point Reyes",
        "location": "Point Reyes, CA, USA",
        "lat": 38.0722, "lon": -122.7870,
        "bands": ["hf"],
    },
    {
        "url": "http://dl0bld.websdr.org:8901/",
        "name": "DL0BLD",
        "location": "Wolfenbüttel, Germany",
        "lat": 52.1601, "lon": 10.5375,
        "bands": ["hf", "2m"],
    },
    {
        "url": "http://pa3ekp.websdr.org:8901/",
        "name": "PA3EKP",
        "location": "Amsterdam, Netherlands",
        "lat": 52.3676, "lon": 4.9041,
        "bands": ["hf", "6m", "2m"],
    },
    {
        "url": "http://vk2rh.websdr.org:8901/",
        "name": "VK2RH",
        "location": "Hornsby, NSW, Australia",
        "lat": -33.7022, "lon": 151.0991,
        "bands": ["hf", "6m"],
    },
    {
        "url": "http://w4ax.websdr.org:8901/",
        "name": "W4AX",
        "location": "Atlanta, GA, USA",
        "lat": 33.7490, "lon": -84.3880,
        "bands": ["hf", "6m", "2m", "70cm"],
    },
    {
        "url": "http://websdr.k3fef.com:8901/",
        "name": "K3FEF",
        "location": "Milford, PA, USA",
        "lat": 41.3229, "lon": -74.7996,
        "bands": ["hf", "2m"],
    },
    {
        "url": "http://jn3xbc.websdr.org:8901/",
        "name": "JN3XBC",
        "location": "Osaka, Japan",
        "lat": 34.6937, "lon": 135.5022,
        "bands": ["hf", "6m"],
    },
    {
        "url": "http://zs6bww.websdr.org:8901/",
        "name": "ZS6BWW",
        "location": "Pretoria, South Africa",
        "lat": -25.7479, "lon": 28.2293,
        "bands": ["hf"],
    },
    {
        "url": "http://on5hb.websdr.org:8901/",
        "name": "ON5HB",
        "location": "Hasselt, Belgium",
        "lat": 50.9311, "lon": 5.3378,
        "bands": ["hf", "6m", "2m", "70cm"],
    },
    {
        "url": "http://websdr.sdrutah.org:8901/",
        "name": "Northern Utah WebSDR",
        "location": "Utah, USA",
        "lat": 41.2230, "lon": -111.9732,
        "bands": ["hf", "6m", "2m", "70cm", "23cm"],
    },
    {
        "url": "http://g4fkh.websdr.org:8901/",
        "name": "G4FKH",
        "location": "Cheltenham, UK",
        "lat": 51.8994, "lon": -2.0783,
        "bands": ["hf", "6m", "2m"],
    },
]


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class WebSDRNode:
    url: str                         # Full URL e.g. http://websdr.ewi.utwente.nl:8901/
    name: str                        # Operator name/callsign
    location: str                    # Human-readable city/country
    lat: float
    lon: float
    bands: list[str]                 # Band strings e.g. ["hf", "2m", "70cm"]
    freq_min_khz: float              # Derived from bands
    freq_max_khz: float
    users: int = 0                   # Current users (not always available)
    distance_km: float = 0.0

    def to_dict(self) -> dict:
        return {
            "url": self.url,
            "name": self.name,
            "location": self.location,
            "lat": round(self.lat, 4),
            "lon": round(self.lon, 4),
            "bands": self.bands,
            "freq_min_khz": self.freq_min_khz,
            "freq_max_khz": self.freq_max_khz,
            "users": self.users,
            "distance_km": round(self.distance_km, 1),
        }


# ---------------------------------------------------------------------------
# Geometry (shared logic with kiwi_directory)
# ---------------------------------------------------------------------------

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Band helpers
# ---------------------------------------------------------------------------

def bands_to_freq_range(bands: list[str]) -> tuple[float, float]:
    """Return (freq_min_khz, freq_max_khz) covering all listed bands."""
    all_min, all_max = float("inf"), 0.0
    for b in bands:
        key = b.lower().strip()
        if key in BAND_FREQ_MAP:
            lo, hi = BAND_FREQ_MAP[key]
            all_min = min(all_min, lo)
            all_max = max(all_max, hi)
    if all_min == float("inf"):
        return 0.0, 30000.0
    return all_min, all_max


def _extract_bands_from_text(text: str) -> list[str]:
    """Heuristically parse band descriptions like '80m, 40m, 2m, 70cm'."""
    found: list[str] = []
    text_lower = text.lower()
    for key in BAND_FREQ_MAP:
        # Match whole band tokens: "2m" but not "152m" etc.
        if re.search(r'(?<![0-9])' + re.escape(key) + r'(?![0-9a-z])', text_lower):
            found.append(key)
    # Shortwave / HF catchall
    if not found:
        if "shortwave" in text_lower or "hf" in text_lower or "sw" in text_lower:
            found.append("hf")
        elif "vhf" in text_lower:
            found.append("vhf")
        elif "uhf" in text_lower:
            found.append("uhf")
    return found or ["hf"]


# ---------------------------------------------------------------------------
# Scrapers
# ---------------------------------------------------------------------------

async def _fetch_rxtx_info(session) -> list[WebSDRNode]:
    """
    Scrape rx-tx.info/table-sdr-points for WebSDR nodes.
    The page shows a table with columns: Name, Type, URL, Grid/Coords, Bands, etc.
    We filter rows where Type contains 'websdr'.
    """
    try:
        import aiohttp
    except ImportError:
        return []

    timeout = aiohttp.ClientTimeout(total=FETCH_TIMEOUT)
    headers = {"User-Agent": _UA, "Accept": "text/html"}
    try:
        async with session.get(RXTX_INFO_URL, timeout=timeout, headers=headers) as resp:
            if resp.status != 200:
                logger.debug("rx-tx.info returned HTTP %d", resp.status)
                return []
            html = await resp.text()
    except Exception as exc:
        logger.debug("rx-tx.info fetch failed: %s", exc)
        return []

    return _parse_rxtx_table(html)


def _parse_rxtx_table(html: str) -> list[WebSDRNode]:
    """
    Parse the rx-tx.info table HTML.

    The page renders a DataTables table. Each <tr> contains cells with:
    Name | Type | URL | Grid | Lat | Lon | Country | Bands | ...

    We look for rows where type matches 'websdr' (case-insensitive).
    """
    nodes: list[WebSDRNode] = []

    # Extract all table rows
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
    for row in rows:
        # Extract cell text content
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
        if not cells:
            continue

        # Clean HTML tags from cells
        clean = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]

        if len(clean) < 4:
            continue

        # Look for WebSDR type indicator
        row_text = " ".join(clean).lower()
        if "websdr" not in row_text:
            continue

        # Extract URL from hrefs in row
        url_match = re.search(r'href=["\']?(https?://[^"\'>\s]+)', row, re.IGNORECASE)
        if not url_match:
            continue
        url = url_match.group(1).rstrip("/") + "/"

        # Skip if it's a kiwisdr.com URL (those are KiwiSDR nodes)
        if "kiwisdr" in url.lower():
            continue

        # Try to extract lat/lon — often in cells or data attributes
        lat, lon = 0.0, 0.0
        lat_matches = re.findall(r'(-?\d{1,2}\.\d+)', " ".join(clean))
        lon_matches = re.findall(r'(-?\d{1,3}\.\d+)', " ".join(clean))
        for raw_lat in lat_matches:
            v = float(raw_lat)
            if -90 <= v <= 90:
                lat = v
                break
        for raw_lon in lon_matches:
            v = float(raw_lon)
            if -180 <= v <= 180 and v != lat:
                lon = v
                break

        if lat == 0.0 and lon == 0.0:
            continue

        # Name / callsign from first non-URL cell
        name = clean[0] if clean[0] else urlparse(url).netloc

        # Location — look for city/country in cells
        location = ""
        for cell in clean[2:]:
            if cell and not cell.startswith("http") and len(cell) > 2:
                location = cell
                break

        # Bands from text
        bands = _extract_bands_from_text(row_text)
        freq_min, freq_max = bands_to_freq_range(bands)

        nodes.append(WebSDRNode(
            url=url, name=name, location=location,
            lat=lat, lon=lon, bands=bands,
            freq_min_khz=freq_min, freq_max_khz=freq_max,
        ))

    return nodes


async def _fetch_websdr_org(session) -> list[WebSDRNode]:
    """
    Scrape the websdr.org main page for receiver links.
    Returns nodes without GPS coordinates (they must be geocoded or omitted from map).
    """
    try:
        import aiohttp
    except ImportError:
        return []

    timeout = aiohttp.ClientTimeout(total=FETCH_TIMEOUT)
    headers = {"User-Agent": _UA, "Accept": "text/html"}
    try:
        async with session.get(WEBSDR_ORG_URL, timeout=timeout, headers=headers) as resp:
            if resp.status != 200:
                logger.debug("websdr.org returned HTTP %d", resp.status)
                return []
            html = await resp.text()
    except Exception as exc:
        logger.debug("websdr.org fetch failed: %s", exc)
        return []

    return _parse_websdr_org(html)


def _parse_websdr_org(html: str) -> list[WebSDRNode]:
    """
    Parse the websdr.org receiver list HTML.

    The page renders entries roughly as:
      <a href="http://...">Callsign / description</a> ... bands ... users
    """
    nodes: list[WebSDRNode] = []

    # Match anchor tags pointing to external SDR receivers
    for m in re.finditer(
        r'<a\s+href=["\']?(https?://[^"\'>\s]+)["\']?[^>]*>(.*?)</a>',
        html, re.DOTALL | re.IGNORECASE
    ):
        url_raw = m.group(1).strip()
        link_text = re.sub(r'<[^>]+>', '', m.group(2)).strip()

        # Skip internal websdr.org links
        if "websdr.org" in url_raw and not re.search(r':\d{4,}', url_raw):
            continue
        if not re.search(r'https?://', url_raw):
            continue

        url = url_raw.rstrip("/") + "/"

        # Grab surrounding context for band info (next ~200 chars after the anchor)
        end_pos = m.end()
        context = re.sub(r'<[^>]+>', ' ', html[end_pos:end_pos + 300])

        bands = _extract_bands_from_text(context + " " + link_text)
        freq_min, freq_max = bands_to_freq_range(bands)

        nodes.append(WebSDRNode(
            url=url, name=link_text or urlparse(url).netloc,
            location="",
            lat=0.0, lon=0.0,
            bands=bands,
            freq_min_khz=freq_min, freq_max_khz=freq_max,
        ))

    # Deduplicate by URL
    seen: set[str] = set()
    unique: list[WebSDRNode] = []
    for n in nodes:
        if n.url not in seen:
            seen.add(n.url)
            unique.append(n)

    return unique


def _load_seed_nodes() -> list[WebSDRNode]:
    """Return the hardcoded seed node list as WebSDRNode objects."""
    nodes: list[WebSDRNode] = []
    for entry in SEED_NODES:
        freq_min, freq_max = bands_to_freq_range(entry.get("bands", ["hf"]))
        nodes.append(WebSDRNode(
            url=entry["url"],
            name=entry.get("name", ""),
            location=entry.get("location", ""),
            lat=entry.get("lat", 0.0),
            lon=entry.get("lon", 0.0),
            bands=entry.get("bands", ["hf"]),
            freq_min_khz=freq_min,
            freq_max_khz=freq_max,
        ))
    return nodes


# ---------------------------------------------------------------------------
# Directory manager
# ---------------------------------------------------------------------------

class WebSDRDirectory:
    """
    Manages the WebSDR public receiver list.

    Usage:
        directory = WebSDRDirectory()
        await directory.refresh()
        asyncio.create_task(directory.auto_refresh_loop())

        nodes = directory.get_nodes(freq_khz=145000, lat=51.5, lon=-0.1)
    """

    def __init__(self) -> None:
        self._nodes: list[WebSDRNode] = []
        self._fetched_at: float = 0.0
        self._lock = asyncio.Lock()
        # Pre-load seeds so the directory is immediately useful before first refresh
        self._nodes = _load_seed_nodes()

    async def refresh(self) -> None:
        """Fetch the public WebSDR directory and update the internal cache."""
        try:
            import aiohttp
        except ImportError:
            logger.warning("aiohttp not installed — WebSDR directory unavailable.")
            return

        nodes: list[WebSDRNode] = []

        async with aiohttp.ClientSession() as session:
            # Primary: rx-tx.info (has GPS coords)
            rxtx_nodes = await _fetch_rxtx_info(session)
            if rxtx_nodes:
                nodes.extend(rxtx_nodes)
                logger.info("WebSDR directory: %d nodes from rx-tx.info", len(rxtx_nodes))

            # Supplement with websdr.org (adds nodes without coords, useful for URL list)
            # Only do this if rx-tx.info already gave us a base
            if not nodes:
                org_nodes = await _fetch_websdr_org(session)
                if org_nodes:
                    nodes.extend(org_nodes)
                    logger.info("WebSDR directory: %d nodes from websdr.org", len(org_nodes))

        if not nodes:
            logger.warning("WebSDR directory: all sources failed, keeping seed+stale cache (%d nodes)", len(self._nodes))
            return

        # Merge with seeds: prefer scraped data, add any seeds not already present
        scraped_urls = {n.url for n in nodes}
        for seed in _load_seed_nodes():
            if seed.url not in scraped_urls:
                nodes.append(seed)

        # Deduplicate by URL
        seen: set[str] = set()
        deduped: list[WebSDRNode] = []
        for n in nodes:
            if n.url not in seen:
                seen.add(n.url)
                deduped.append(n)

        async with self._lock:
            self._nodes = deduped
            self._fetched_at = time.monotonic()

        logger.info("WebSDR directory refreshed: %d nodes cached", len(self._nodes))

    def get_nodes(
        self,
        freq_khz: float,
        lat: float,
        lon: float,
        limit: int = 20,
        max_distance_km: Optional[float] = None,
        require_coords: bool = False,
    ) -> list[WebSDRNode]:
        """
        Return proximity-sorted, frequency-filtered WebSDR nodes.

        Args:
            freq_khz:         Filter to nodes covering this frequency. 0 = no filter.
            lat / lon:        Operator location for proximity sort.
            limit:            Max results.
            max_distance_km:  Optional distance filter.
            require_coords:   If True, skip nodes with lat/lon == 0 (no location data).
        """
        results: list[WebSDRNode] = []
        for node in self._nodes:
            if require_coords and node.lat == 0.0 and node.lon == 0.0:
                continue
            if freq_khz > 0 and not (node.freq_min_khz <= freq_khz <= node.freq_max_khz):
                continue
            dist = haversine(lat, lon, node.lat, node.lon) if (node.lat != 0.0 or node.lon != 0.0) else 99999.0
            if max_distance_km is not None and dist > max_distance_km:
                continue
            results.append(WebSDRNode(
                url=node.url, name=node.name, location=node.location,
                lat=node.lat, lon=node.lon, bands=node.bands,
                freq_min_khz=node.freq_min_khz, freq_max_khz=node.freq_max_khz,
                users=node.users, distance_km=dist,
            ))
        results.sort(key=lambda n: n.distance_km)
        return results[:limit]

    def get_vhf_nodes(self, lat: float, lon: float, limit: int = 20) -> list[WebSDRNode]:
        """Convenience method: return nodes covering VHF/UHF (>30 MHz)."""
        return self.get_nodes(freq_khz=0, lat=lat, lon=lon, limit=limit, require_coords=True)

    @property
    def is_stale(self) -> bool:
        return (time.monotonic() - self._fetched_at) > CACHE_TTL

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def vhf_node_count(self) -> int:
        """Number of nodes with coverage above 30 MHz."""
        return sum(1 for n in self._nodes if n.freq_max_khz > 30000)

    async def auto_refresh_loop(self) -> None:
        """Background task: refresh the directory every CACHE_TTL seconds."""
        while True:
            await asyncio.sleep(CACHE_TTL)
            await self.refresh()
