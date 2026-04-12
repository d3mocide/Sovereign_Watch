"""
OpenAIP global airspace zone ingestion source.

Polls the OpenAIP Core API once every 24 hours and:
  1. Caches the full GeoJSON FeatureCollection for the configured region in Redis
     (key: airspace:zones, TTL 25 hours).
  2. Archives each zone to TimescaleDB for historical queries and audit.

OpenAIP is a free, globally-maintained aviation database with no .gov requirement.
API key signup: https://www.openaip.net/users/sign_up  (email only)
Docs: https://docs.openaip.net

Required env var: OPENAIP_API_KEY
Optional env vars:
  OPENAIP_BBOX_EXPAND_DEG  — degrees to expand around the mission bbox (default 2.0)
  OPENAIP_TYPES            — comma-separated types to fetch
                             (default: RESTRICTED,DANGER,PROHIBITED,WARNING,TRA,TSA,ADIZ)
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Any

import aiohttp

logger = logging.getLogger("SovereignWatch.OpenAIPSource")

# ── Constants ─────────────────────────────────────────────────────────────────

_BASE_URL = "https://api.core.openaip.net/api"
_PAGE_LIMIT = 1000
_POLL_INTERVAL_S = 86_400  # 24 hours — airspace is largely static
_REDIS_KEY = "airspace:zones"
_REDIS_TTL_S = 90_000  # 25 hours

# Airspace types to fetch by default (tactical relevance)
_DEFAULT_TYPES = [
    "RESTRICTED",   # 0
    "DANGER",       # 1
    "PROHIBITED",   # 2
    "WARNING",      # 6
    "TRA",          # 15
    "TSA",          # 16
    "ADIZ",         # 7
]

# Mapping integers to strings for OpenAIP V2 API
_AIRSPACE_TYPES: dict[int, str] = {
    0: "RESTRICTED",
    1: "DANGER",
    2: "PROHIBITED",
    3: "CTR",
    4: "TMA",
    5: "RMZ",
    6: "TMZ",
    7: "ADIZ",
    8: "ATZ",
    9: "FIS",
    10: "VFR",
    11: "HELICOPTER",
    12: "GLIDER",
    13: "AEROBATICS",
    14: "OVERFLYING",
    15: "TRA",
    16: "TSA",
    17: "VOLCANO",
    18: "CORRIDOR",
    19: "PROTECT",
    20: "GLIDING",
    21: "TRP",
    22: "PLANNED",
    23: "MAX_ALT",
    24: "CAUTION",
    25: "MOD_CAUTION",
    26: "MILITARY",
    27: "FIR",
    28: "UIR",
    29: "CONTROL",
    30: "AIRWAY",
    31: "OUTSIDE_60NM",
    32: "CLASS",
    33: "TMA_P",
    34: "TIZ",
    35: "TIA",
    36: "OTHER",
}

_ICAO_CLASSES: dict[int, str] = {
    0: "CLASS_A",
    1: "CLASS_B",
    2: "CLASS_C",
    3: "CLASS_D",
    4: "CLASS_E",
    5: "CLASS_F",
    6: "CLASS_G",
    7: "UNCLASSIFIED",
    8: "OTHER",
}

# Display colours by type (used as properties in GeoJSON for frontend layer)
_TYPE_COLORS: dict[str, str] = {
    "PROHIBITED": "#ef4444",   # red-500
    "RESTRICTED": "#f97316",   # orange-500
    "DANGER":     "#eab308",   # yellow-500
    "WARNING":    "#f59e0b",   # amber-500
    "CAUTION":    "#f59e0b",
    "TRA":        "#8b5cf6",   # violet-500
    "TSA":        "#a855f7",   # purple-500
    "ADIZ":       "#06b6d4",   # cyan-500
    "CTR":        "#3b82f6",   # blue-500
    "TMA":        "#3b82f6",
    "CLASS":      "#3b82f6",
    "CONTROL":    "#3b82f6",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _format_limit(limit: dict[str, Any] | None) -> str | None:
    """Convert OpenAIP limit object to a human-readable string (e.g. 'FL 100')."""
    if not limit:
        return None
    value = limit.get("value")
    unit = limit.get("unit", 0)
    ref = limit.get("referenceDatum", 0)

    if value is None:
        return None

    unit_str = {0: "FT", 1: "FL", 2: "M"}.get(unit, "")
    ref_str = {0: "MSL", 1: "GND", 2: "WGS84"}.get(ref, "")

    if unit == 1:   # Flight level
        return f"FL {int(value)}"
    return f"{int(value)} {unit_str} {ref_str}".strip()


def _parse_zone(item: dict[str, Any]) -> dict[str, Any] | None:
    """
    Convert a raw OpenAIP airspace item to our internal schema.

    Returns None if the item lacks valid geometry.
    """
    geom = item.get("geometry")
    if not geom or geom.get("type") not in ("Polygon", "MultiPolygon"):
        return None

    zone_type_raw = item.get("type", "UNKNOWN")
    zone_type = (
        _AIRSPACE_TYPES.get(zone_type_raw, str(zone_type_raw))
        if isinstance(zone_type_raw, int)
        else zone_type_raw
    )

    icao_class_raw = item.get("icaoClass", "UNCLASSIFIED")
    icao_class = (
        _ICAO_CLASSES.get(icao_class_raw, str(icao_class_raw))
        if isinstance(icao_class_raw, int)
        else icao_class_raw
    )

    return {
        "zone_id":      item.get("_id") or item.get("id", ""),
        "name":         item.get("name"),
        "type":         zone_type,
        "icao_class":   icao_class,
        "country":      item.get("country"),
        "upper_limit":  _format_limit(item.get("upperLimit")),
        "lower_limit":  _format_limit(item.get("lowerLimit")),
        "geometry":     geom,
        "color":        _TYPE_COLORS.get(zone_type, "#94a3b8"),   # slate-400 fallback
    }


def _to_geojson_feature(zone: dict[str, Any]) -> dict[str, Any]:
    """Convert parsed zone dict to a GeoJSON Feature."""
    props = {k: v for k, v in zone.items() if k != "geometry"}
    return {
        "type": "Feature",
        "geometry": zone["geometry"],
        "properties": props,
    }


# ── Source class ──────────────────────────────────────────────────────────────

class OpenAIPSource:
    """
    Polls the OpenAIP airspace API and maintains a Redis GeoJSON cache + DB archive.

    The source is designed for a mission-area-aware poller: it uses the center
    lat/lon + radius from the PollerService mission area to compute a bounding
    box for the OpenAIP query.

    Usage:
        source = OpenAIPSource(redis_client, db_pool)
        await source.run()
        await source.shutdown()
    """

    def __init__(
        self,
        redis_client: Any,
        db_pool: Any | None = None,
        center_lat: float = 0.0,
        center_lon: float = 0.0,
        radius_nm: float = 250.0,
    ) -> None:
        self.redis = redis_client
        self.db_pool = db_pool
        self.center_lat = center_lat
        self.center_lon = center_lon
        self.radius_nm = radius_nm
        self.running = False

        self._trigger_event = asyncio.Event()

        self._api_key = os.environ.get("OPENAIP_API_KEY", "")
        self._bbox_expand = float(os.environ.get("OPENAIP_BBOX_EXPAND_DEG", "2.0"))
        raw_types = os.environ.get("OPENAIP_TYPES", ",".join(_DEFAULT_TYPES))
        self._types = [t.strip().upper() for t in raw_types.split(",") if t.strip()]

        if not self._api_key:
            logger.warning(
                "OPENAIP_API_KEY not set — OpenAIP airspace source will be skipped. "
                "Get a free key at https://www.openaip.net/users/sign_up"
            )

    @property
    def _credentials_available(self) -> bool:
        return bool(self._api_key)

    async def update_mission_area(
        self, center_lat: float, center_lon: float, radius_nm: float
    ) -> None:
        """Called by the service when the mission area changes."""
        self.center_lat = center_lat
        self.center_lon = center_lon
        self.radius_nm = radius_nm
        # Signal clearing *before* deleting so the frontend can immediately react
        await self.redis.publish(_REDIS_KEY, json.dumps({"status": "clearing"}))
        # Clear the stale cache
        await self.redis.delete(_REDIS_KEY)
        self._trigger_event.set()

    # ── Public interface ──────────────────────────────────────────────────────

    async def run(self) -> None:
        self.running = True
        logger.info("OpenAIPSource started (interval=%dh)", _POLL_INTERVAL_S // 3600)
        
        while self.running:
            if self._credentials_available:
                try:
                    await self._poll_and_publish()
                except Exception as exc:
                    logger.error("OpenAIP poll cycle failed: %s", exc)

            try:
                # Wait for either the 24h timeout OR a force-poll trigger (mission update)
                await asyncio.wait_for(
                    self._trigger_event.wait(), 
                    timeout=_POLL_INTERVAL_S
                )
                self._trigger_event.clear()
                logger.info("OpenAIP: Instant re-poll triggered by mission area update")
            except asyncio.TimeoutError:
                # Normal cycle
                pass
            except asyncio.CancelledError:
                break

    async def shutdown(self) -> None:
        self.running = False
        logger.info("OpenAIPSource shutting down")

    # ── Internals ─────────────────────────────────────────────────────────────

    def _compute_bbox(self) -> str:
        """
        Compute a bounding box string (minLon,minLat,maxLon,maxLat) for the
        current mission area with a configurable degree buffer.

        Uses a simple degree approximation — sufficient for bbox queries.
        """
        deg_per_nm = 1.0 / 60.0
        lat_delta = self.radius_nm * deg_per_nm + self._bbox_expand
        
        # Proper longitude expansion using cos(lat)
        lon_scale = 1.0 / math.cos(math.radians(self.center_lat))
        lon_delta = (self.radius_nm * deg_per_nm * lon_scale) + self._bbox_expand
        min_lat = max(-90.0,  self.center_lat - lat_delta)
        max_lat = min( 90.0,  self.center_lat + lat_delta)
        min_lon = max(-180.0, self.center_lon - lon_delta)
        max_lon = min( 180.0, self.center_lon + lon_delta)
        return f"{min_lon:.4f},{min_lat:.4f},{max_lon:.4f},{max_lat:.4f}"

    async def _fetch_page(
        self,
        session: aiohttp.ClientSession,
        page: int,
        bbox: str,
    ) -> tuple[list[dict[str, Any]], int]:
        """Fetch one page of airspace results. Returns (items, totalCount)."""
        params: dict[str, Any] = {
            "page":   page,
            "limit":  _PAGE_LIMIT,
            "bbox":   bbox,
            "types":  ",".join(self._types),
        }
        headers = {"x-openaip-api-key": self._api_key}

        async with session.get(
            f"{_BASE_URL}/airspaces",
            params=params,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            if resp.status == 401:
                logger.error("OpenAIP API: invalid API key (401)")
                return [], 0
            if resp.status == 429:
                logger.warning("OpenAIP API rate-limited (429) — skipping cycle")
                return [], 0
            if resp.status != 200:
                text = await resp.text()
                logger.error("OpenAIP API %d: %s", resp.status, text[:200])
                return [], 0
            data = await resp.json()
            return data.get("items", []), data.get("totalCount", 0)

    async def _poll_and_publish(self) -> None:
        bbox = self._compute_bbox()
        t0 = time.monotonic()
        all_zones: list[dict[str, Any]] = []
        failed_parse = 0

        async with aiohttp.ClientSession() as session:
            page = 0
            while True:
                items, total = await self._fetch_page(session, page, bbox)
                if not items:
                    break
                for item in items:
                    parsed = _parse_zone(item)
                    if parsed:
                        all_zones.append(parsed)
                    else:
                        failed_parse += 1
                fetched = page * _PAGE_LIMIT + len(items)
                if fetched >= total or len(items) < _PAGE_LIMIT:
                    break
                page += 1
                await asyncio.sleep(0.3)  # gentle pacing between pages

        feature_collection = {
            "type": "FeatureCollection",
            "features": [_to_geojson_feature(z) for z in all_zones],
        }
        payload = json.dumps(feature_collection)
        await self.redis.set(_REDIS_KEY, payload, ex=_REDIS_TTL_S)
        
        # Notify API listeners that new data is available
        await self.redis.publish(_REDIS_KEY, json.dumps({"status": "updated"}))

        if all_zones and self.db_pool:
            await self._archive_to_db(all_zones)

        elapsed = time.monotonic() - t0
        logger.info(
            "OpenAIP cycle complete: %d airspace zones cached (%.1fs, bbox=%s, failed=%d)",
            len(all_zones), elapsed, bbox, failed_parse,
        )

    async def _archive_to_db(self, zones: list[dict[str, Any]]) -> None:
        now = datetime.now(timezone.utc)
        records = [
            (
                now,
                z["zone_id"],
                z.get("name"),
                z["type"],
                z.get("icao_class"),
                z.get("country"),
                z.get("upper_limit"),
                z.get("lower_limit"),
                json.dumps(z["geometry"]),
            )
            for z in zones
        ]
        query = """
        INSERT INTO airspace_zones (
            time, zone_id, name, type, icao_class, country,
            upper_limit, lower_limit, geometry_json
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT DO NOTHING
        """
        try:
            async with self.db_pool.acquire() as conn:
                await conn.executemany(query, records)
        except Exception as exc:
            logger.error("Airspace DB archive failed: %s", exc)
