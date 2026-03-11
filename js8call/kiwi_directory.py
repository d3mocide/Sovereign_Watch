"""
kiwi_directory.py — KiwiSDR public node directory with proximity filtering.

Fetches the KiwiSDR.com public receiver list, caches it for one hour, and
exposes get_nodes() which returns proximity-sorted, frequency-filtered results.
Designed for use with asyncio; all HTTP I/O is non-blocking via aiohttp.
"""

import asyncio
import json
import logging
import math
import re
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("js8bridge.kiwi_dir")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DIRECTORY_URLS = [
    "http://rx.linkfanel.net/kiwisdr_com.js",      # active mirror
    "https://rx.skywavelinux.com/kiwisdr_com.js",  # alternative mirror
]
CACHE_TTL = 3600        # seconds (1 hour)
FETCH_TIMEOUT = 15      # seconds per HTTP request


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class KiwiNode:
    host: str
    port: int
    lat: float
    lon: float
    freq_min_khz: float
    freq_max_khz: float
    users: int
    num_ch: int
    distance_km: float = 0.0

    def to_dict(self) -> dict:
        return {
            "host": self.host,
            "port": self.port,
            "lat": round(self.lat, 4),
            "lon": round(self.lon, 4),
            "freq_min_khz": self.freq_min_khz,
            "freq_max_khz": self.freq_max_khz,
            "users": self.users,
            "num_ch": self.num_ch,
            "distance_km": round(self.distance_km, 1),
        }


# ---------------------------------------------------------------------------
# Geometry
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
# Directory parser
# ---------------------------------------------------------------------------

def _parse_directory(raw: str) -> list[KiwiNode]:
    """
    Parse the KiwiSDR public directory payload.

    The endpoint returns either proper JSON or a JS-style object literal with
    unquoted keys and trailing commas. We normalise it before parsing.
    """
    text = raw.strip()
    # Strip line comments (e.g., '// KiwiSDR.com receiver list')
    text = re.sub(r'(?m)^\s*//.*$', '', text).strip()
    # Strip JS variable assignment: `var rx_list = [...]` or JSONP wrapper
    text = re.sub(r'^var\s+\w+\s*=\s*', '', text).rstrip(';').strip()

    # Clean garbage after 'bands' comma on specific corrupted lines (e.g. line 4134)
    text = re.sub(r'("bands"\s*:\s*"[^"]+"\s*),.*$', r'\1,', text, flags=re.MULTILINE)

    # Remove trailing commas before closing brackets to fix JSON errors
    text = re.sub(r',\s*([}\]])', r'\1', text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.warning("KiwiSDR directory JSON parse failed: %s — regex fallback", exc)
        return _regex_fallback(raw)

    # Unwrap common envelope shapes
    if isinstance(data, dict):
        for key in ("rx", "receivers", "nodes", "data"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
        else:
            return []

    if not isinstance(data, list):
        return []

    nodes: list[KiwiNode] = []
    for entry in data:
        if not isinstance(entry, dict):
            continue
        node = _extract_node(entry)
        if node:
            nodes.append(node)
    return nodes


def _extract_node(entry: dict) -> Optional[KiwiNode]:
    """Extract a KiwiNode from a directory entry dict. Returns None if incomplete."""
    try:
        host = (entry.get("host") or entry.get("hostname") or "").strip()
        port = int(entry.get("port", 8073))

        if not host and "url" in entry:
            m = re.match(r'https?://([^/:]+)(?::(\d+))?', entry.get("url", ""))
            if m:
                host = m.group(1).strip()
                if m.group(2):
                    port = int(m.group(2))

        if not host:
            return None
        # Sanitise: only allow valid hostname characters
        if not re.fullmatch(r'[a-zA-Z0-9._-]+', host):
            return None

        # GPS coordinates — may be nested as {lat, lon} under 'gpsd' or at top level String "(51.3, -2.9)"
        gps = entry.get("gpsd") or entry.get("gps") or {}
        lat, lon = 0.0, 0.0
        if isinstance(gps, dict):
            lat = float(gps.get("lat", 0))
            lon = float(gps.get("lon", 0))
        elif isinstance(gps, str):
            m = re.match(r'\(([-\d.]+),\s*([-\d.]+)\)', gps)
            if m:
                lat, lon = float(m.group(1)), float(m.group(2))

        if lat == 0.0 and lon == 0.0:
            lat = float(entry.get("lat", 0))
            lon = float(entry.get("lon", 0))

        if lat == 0.0 and lon == 0.0:
            return None  # Skip nodes with no usable location

        # Frequency coverage — published as "0-30" (MHz) or "0-30000" (kHz)
        bands_raw = str(entry.get("bands", "0-30000"))
        m = re.match(r'([\d.]+)[-–]([\d.]+)', bands_raw)
        if m:
            fmin, fmax = float(m.group(1)), float(m.group(2))
            if fmax < 1000:       # values in MHz — convert to kHz
                fmin *= 1000
                fmax *= 1000
        else:
            fmin, fmax = 0.0, 30000.0

        users = int(entry.get("users", 0))
        num_ch = int(entry.get("num_ch") or entry.get("users_max") or 8)

        return KiwiNode(
            host=host, port=port,
            lat=lat, lon=lon,
            freq_min_khz=fmin, freq_max_khz=fmax,
            users=users, num_ch=num_ch,
        )
    except (TypeError, ValueError, KeyError):
        return None


def _regex_fallback(raw: str) -> list[KiwiNode]:
    """Last-resort regex extraction when JSON parsing fails entirely."""
    nodes: list[KiwiNode] = []
    for block in re.finditer(r'\{[^{}]+\}', raw):
        chunk = block.group()
        host_m = re.search(r'"?(?:host|hostname)"?\s*:\s*"([^"]+)"', chunk)
        lat_m  = re.search(r'"?lat"?\s*:\s*([-\d.]+)', chunk)
        lon_m  = re.search(r'"?lon"?\s*:\s*([-\d.]+)', chunk)
        port_m = re.search(r'"?port"?\s*:\s*(\d+)', chunk)
        if host_m and lat_m and lon_m:
            try:
                nodes.append(KiwiNode(
                    host=host_m.group(1),
                    port=int(port_m.group(1)) if port_m else 8073,
                    lat=float(lat_m.group(1)),
                    lon=float(lon_m.group(1)),
                    freq_min_khz=0.0, freq_max_khz=30000.0,
                    users=0, num_ch=8,
                ))
            except (ValueError, TypeError):
                continue
    return nodes


# ---------------------------------------------------------------------------
# Directory manager
# ---------------------------------------------------------------------------

class KiwiDirectory:
    """
    Manages the KiwiSDR public receiver list.

    Usage:
        directory = KiwiDirectory()
        await directory.refresh()                        # initial fetch
        asyncio.create_task(directory.auto_refresh_loop())  # background refresh

        nodes = directory.get_nodes(freq_khz=14074, lat=51.5, lon=-0.1)
    """

    def __init__(self) -> None:
        self._nodes: list[KiwiNode] = []
        self._fetched_at: float = 0.0
        self._lock = asyncio.Lock()

    async def refresh(self) -> None:
        """Fetch the public KiwiSDR directory and update the internal cache."""
        try:
            import aiohttp
        except ImportError:
            logger.warning("aiohttp not installed — KiwiSDR directory unavailable. "
                           "Add aiohttp to requirements.txt.")
            return

        for url in DIRECTORY_URLS:
            try:
                timeout = aiohttp.ClientTimeout(total=FETCH_TIMEOUT)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            logger.debug("KiwiSDR directory %s returned HTTP %d", url, resp.status)
                            continue
                        raw = await resp.text()
                nodes = _parse_directory(raw)
                if nodes:
                    async with self._lock:
                        self._nodes = nodes
                        self._fetched_at = time.monotonic()
                    logger.info("KiwiSDR directory refreshed: %d nodes cached", len(nodes))
                    return
            except Exception as exc:
                logger.warning("KiwiSDR directory fetch from %s failed: %s", url, exc)

        logger.warning("KiwiSDR directory: all sources failed, keeping stale cache (%d nodes)", len(self._nodes))

    def get_nodes(
        self,
        freq_khz: float,
        lat: float,
        lon: float,
        max_users_pct: float = 0.9,
        limit: int = 20,
        max_distance_km: float | None = None,
    ) -> list[KiwiNode]:
        """
        Return proximity-sorted, frequency-filtered KiwiSDR nodes.

        Filters out:
          - Nodes whose frequency range doesn't cover freq_khz
          - Nodes at >= max_users_pct capacity
          - Nodes beyond max_distance_km (when set)

        Returns at most `limit` results, closest first.
        """
        results: list[KiwiNode] = []
        for node in self._nodes:
            if freq_khz and not (node.freq_min_khz <= freq_khz <= node.freq_max_khz):
                continue
            if node.num_ch > 0 and node.users >= max_users_pct * node.num_ch:
                continue
            dist = haversine(lat, lon, node.lat, node.lon)
            if max_distance_km is not None and dist > max_distance_km:
                continue
            # Create a copy with distance populated
            results.append(KiwiNode(
                host=node.host, port=node.port,
                lat=node.lat, lon=node.lon,
                freq_min_khz=node.freq_min_khz, freq_max_khz=node.freq_max_khz,
                users=node.users, num_ch=node.num_ch,
                distance_km=dist,
            ))
        results.sort(key=lambda n: n.distance_km)
        return results[:limit]

    @property
    def is_stale(self) -> bool:
        return (time.monotonic() - self._fetched_at) > CACHE_TTL

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    async def auto_refresh_loop(self) -> None:
        """Background task: refresh the directory every CACHE_TTL seconds."""
        while True:
            await asyncio.sleep(CACHE_TTL)
            await self.refresh()
