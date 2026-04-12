"""
FAA NOTAM (Notice to Air Missions) ingestion source.

Polls the FAA Digital-NOTAM Exchange API every 10 minutes and:
  1. Writes the full active NOTAM set to Redis (key: notam:active_zones, TTL 15 min)
  2. Persists each ingested NOTAM to TimescaleDB for historical queries

FAA NOTAM API docs: https://external-api.faa.gov/notamapi/v1/notams
Requires env vars: FAA_NOTAM_CLIENT_ID, FAA_NOTAM_CLIENT_SECRET

If credentials are absent the source logs a warning and skips polling gracefully —
the rest of the aviation_poller continues to function normally.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import aiohttp

logger = logging.getLogger("SovereignWatch.NOTAMSource")

# ── Constants ─────────────────────────────────────────────────────────────────

_FAA_BASE_URL = "https://external-api.faa.gov/notamapi/v1/notams"
_PAGE_SIZE = 1000
_POLL_INTERVAL_S = 600  # 10 minutes — FAA updates every ~5 min
_REDIS_KEY = "notam:active_zones"
_REDIS_TTL_S = 900  # 15 minutes

# NOTAM keyword → human-readable category for UI colour-coding
_KEYWORD_CATEGORY: dict[str, str] = {
    "OBST": "OBSTACLE",
    "AIRSPACE": "AIRSPACE",
    "RWY": "RUNWAY",
    "TWY": "TAXIWAY",
    "SVC": "SERVICE",
    "NAV": "NAVAID",
    "COM": "COMMUNICATIONS",
    "GPS": "GPS_OUTAGE",
    "LASER": "LASER",
    "UAS": "DRONE",
    "TFR": "TFR",
    "PARACHUTE": "PARACHUTE",
    "FIREWORK": "FIREWORK",
    "MIL": "MILITARY",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_category(keyword: str | None) -> str:
    """Map FAA keyword to a display category string."""
    if not keyword:
        return "OTHER"
    return _KEYWORD_CATEGORY.get(keyword.upper(), keyword.upper())


def _parse_notam(item: dict[str, Any]) -> dict[str, Any] | None:
    """
    Convert a raw FAA NOTAM API item to our internal schema.

    Returns None if the item lacks a valid position.
    """
    props = item.get("properties", {})
    geom = item.get("geometry")

    # Extract coordinates — FAA API may return a Point geometry
    lat: float | None = None
    lon: float | None = None
    radius_nm: float | None = None
    geom_type = "POINT"

    if geom and geom.get("type") == "Point":
        coords = geom.get("coordinates", [])
        if len(coords) >= 2:
            lon, lat = coords[0], coords[1]
    elif props.get("locationLat") and props.get("locationLon"):
        lat = float(props["locationLat"])
        lon = float(props["locationLon"])

    if lat is None or lon is None:
        return None

    # Altitude bounds (FAA uses FL × 100 for feet)
    def _fl_to_ft(val: Any) -> int | None:
        try:
            return int(float(val)) * 100
        except (TypeError, ValueError):
            return None

    # Parse ISO timestamps gracefully
    def _parse_ts(s: str | None) -> str | None:
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt.isoformat()
        except ValueError:
            return s

    keyword = props.get("keyword", "")
    category = _resolve_category(keyword)

    return {
        "notam_id": props.get("notamID") or item.get("id", ""),
        "icao_id": props.get("icaoId"),
        "feature_name": props.get("featureName"),
        "classification": props.get("classification"),
        "keyword": keyword,
        "category": category,
        "effective_start": _parse_ts(props.get("effectiveStart")),
        "effective_end": _parse_ts(props.get("effectiveEnd")),
        "lat": lat,
        "lon": lon,
        "radius_nm": radius_nm,
        "min_alt_ft": _fl_to_ft(props.get("minimumFL")),
        "max_alt_ft": _fl_to_ft(props.get("maximumFL")),
        "raw_text": props.get("text") or props.get("traditionalMessage", ""),
        "geom_type": geom_type,
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }


def _to_geojson_feature(notam: dict[str, Any]) -> dict[str, Any]:
    """Convert parsed NOTAM dict to a GeoJSON Feature."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [notam["lon"], notam["lat"]],
        },
        "properties": {k: v for k, v in notam.items() if k not in ("lat", "lon")},
    }


# ── Source class ──────────────────────────────────────────────────────────────

class NOTAMSource:
    """
    Polls the FAA NOTAM API and maintains a Redis GeoJSON cache + DB archive.

    Usage:
        source = NOTAMSource(redis_client, db_pool)
        await source.run()          # blocking poll loop
        await source.shutdown()     # graceful stop
    """

    def __init__(self, redis_client: Any, db_pool: Any | None = None) -> None:
        self.redis = redis_client
        self.db_pool = db_pool
        self.running = False

        self._client_id = os.environ.get("FAA_NOTAM_CLIENT_ID", "")
        self._client_secret = os.environ.get("FAA_NOTAM_CLIENT_SECRET", "")

        if not self._client_id or not self._client_secret:
            logger.warning(
                "FAA_NOTAM_CLIENT_ID / FAA_NOTAM_CLIENT_SECRET not set — "
                "NOTAM source will be skipped."
            )

    @property
    def _credentials_available(self) -> bool:
        return bool(self._client_id and self._client_secret)

    # ── Public interface ──────────────────────────────────────────────────────

    async def run(self) -> None:
        """Main poll loop — runs until shutdown() is called."""
        self.running = True
        logger.info("NOTAMSource started (interval=%ds)", _POLL_INTERVAL_S)

        while self.running:
            if self._credentials_available:
                try:
                    await self._poll_and_publish()
                except Exception as exc:
                    logger.error("NOTAM poll cycle failed: %s", exc)
            await asyncio.sleep(_POLL_INTERVAL_S)

    async def shutdown(self) -> None:
        self.running = False
        logger.info("NOTAMSource shutting down")

    # ── Internals ─────────────────────────────────────────────────────────────

    async def _fetch_page(
        self,
        session: aiohttp.ClientSession,
        page_num: int,
    ) -> list[dict[str, Any]]:
        """Fetch a single page of NOTAM results from the FAA API."""
        params = {
            "pageSize": _PAGE_SIZE,
            "pageNum": page_num,
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }
        async with session.get(
            _FAA_BASE_URL,
            params=params,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            if resp.status == 429:
                logger.warning("FAA NOTAM API rate-limited (429) — skipping cycle")
                return []
            if resp.status != 200:
                text = await resp.text()
                logger.error("FAA NOTAM API %d: %s", resp.status, text[:200])
                return []
            data = await resp.json()
            return data.get("items", [])

    async def _poll_and_publish(self) -> None:
        """Fetch all active NOTAMs, update Redis cache, and archive to DB."""
        t0 = time.monotonic()
        all_notams: list[dict[str, Any]] = []
        failed_parse = 0

        async with aiohttp.ClientSession() as session:
            page = 1
            while True:
                items = await self._fetch_page(session, page)
                if not items:
                    break
                for item in items:
                    parsed = _parse_notam(item)
                    if parsed:
                        all_notams.append(parsed)
                    else:
                        failed_parse += 1
                if len(items) < _PAGE_SIZE:
                    break  # last page
                page += 1
                await asyncio.sleep(0.5)  # be polite

        if not all_notams:
            logger.warning("No NOTAM records parsed this cycle (failed=%d)", failed_parse)
            return

        # Build GeoJSON FeatureCollection for Redis
        feature_collection = {
            "type": "FeatureCollection",
            "features": [_to_geojson_feature(n) for n in all_notams],
        }
        payload = json.dumps(feature_collection)
        await self.redis.set(_REDIS_KEY, payload, ex=_REDIS_TTL_S)

        # Archive to TimescaleDB
        if self.db_pool:
            await self._archive_to_db(all_notams)

        elapsed = time.monotonic() - t0
        logger.info(
            "NOTAM cycle complete: %d active NOTAMs cached (%.1fs, parse_failures=%d)",
            len(all_notams),
            elapsed,
            failed_parse,
        )

    async def _archive_to_db(self, notams: list[dict[str, Any]]) -> None:
        """Insert NOTAM records into TimescaleDB (idempotent via ON CONFLICT DO NOTHING)."""
        now = datetime.now(timezone.utc)
        records = [
            (
                now,
                n["notam_id"],
                n.get("icao_id"),
                n.get("feature_name"),
                n.get("classification"),
                n.get("keyword"),
                n.get("effective_start"),
                n.get("effective_end"),
                n.get("lat"),
                n.get("lon"),
                n.get("radius_nm"),
                n.get("min_alt_ft"),
                n.get("max_alt_ft"),
                n.get("raw_text"),
                n.get("geom_type"),
            )
            for n in notams
        ]
        query = """
        INSERT INTO notam_events (
            time, notam_id, icao_id, feature_name, classification, keyword,
            effective_start, effective_end, lat, lon, radius_nm,
            min_alt_ft, max_alt_ft, raw_text, geom_type
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT DO NOTHING
        """
        try:
            async with self.db_pool.acquire() as conn:
                await conn.executemany(query, records)
        except Exception as exc:
            logger.error("NOTAM DB archive failed: %s", exc)
