"""
Space weather source — NOAA SWPC Kp-index, Auroral Oval, and NOAA Scales ingestion.

Polls three NOAA SWPC endpoints:
  - Kp-index (1-minute cadence) every 15 minutes → Redis + TimescaleDB
  - Auroral Oval GeoJSON every 5 minutes         → Redis cache
  - NOAA Scales (R/S/G events) every 15 minutes  → Redis cache + suppress key

Redis keys written:
  space_weather:kp_current          — latest Kp value as JSON
  space_weather:kp_history          — last 24h series as JSON array
  space_weather:aurora_geojson      — NOAA 1-hour auroral forecast GeoJSON
  space_weather:noaa_scales         — current R/S/G scale levels as JSON
  space_weather:suppress_signal_loss — set with 70-min TTL when R3-R5 or G3+ active

TimescaleDB writes (psycopg2 via asyncio.to_thread):
  space_weather_kp hypertable — rolling 7-day Kp history
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, UTC

import httpx
import psycopg2
from psycopg2.extras import execute_values

from sources.base import BaseSource

logger = logging.getLogger("space_pulse.space_weather")

KP_1M_URL     = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
AURORA_URL    = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json"
NOAA_SCALES_URL = "https://services.swpc.noaa.gov/products/noaa-scales.json"
USER_AGENT    = "SovereignWatch/1.0 (SpacePulse space weather)"
TIMEOUT       = 15.0

# Alert suppression: active when R-scale >= 3 (Radio Blackout) or G-scale >= 3 (Geomagnetic Storm)
RADIO_BLACKOUT_THRESHOLD   = 3   # R3-R5
GEOMAGNETIC_STORM_THRESHOLD = 3  # G3-G5
SUPPRESSION_TTL_SECONDS    = 4200  # 70 minutes (60 min alert + 10 min buffer)

STORM_LEVELS = {
    0: "quiet", 1: "quiet", 2: "quiet",
    3: "unsettled", 4: "active",
    5: "G1", 6: "G2", 7: "G3", 8: "G4", 9: "G5",
}

REDIS_KEY_KP_LAST_FETCH = "space_weather:kp:last_fetch"
REDIS_KEY_AURORA_LAST_FETCH = "space_weather:aurora:last_fetch"
REDIS_KEY_SCALES_LAST_FETCH = "space_weather:scales:last_fetch"


def _kp_to_storm_level(kp: float) -> str:
    return STORM_LEVELS.get(int(kp), "G5" if kp >= 9 else "quiet")


def _parse_scale_int(scale_str: str) -> int:
    """Extract numeric level from NOAA scale string like 'R3', 'G0', 'S2', or bare strings like '3', '0'."""
    if not scale_str:
        return 0
    
    # Try parsing directly if they removed the prefix (e.g., '3')
    try:
        return int(scale_str)
    except ValueError:
        pass
        
    # Fallback for original prefixed format (e.g., 'R3')
    if len(scale_str) < 2:
        return 0
    try:
        return int(scale_str[1:])
    except (ValueError, IndexError):
        return 0


def _store_kp_db_sync(db_url: str, rows: list[tuple]) -> None:
    """Persist Kp records to TimescaleDB (synchronous — call via asyncio.to_thread)."""
    conn = psycopg2.connect(db_url)
    try:
        cur = conn.cursor()
        execute_values(
            cur,
            """
            INSERT INTO space_weather_kp (time, kp, kp_fraction, storm_level, source)
            VALUES %s
            ON CONFLICT DO NOTHING
            """,
            rows,
            page_size=500,
        )
        conn.commit()
        cur.close()
    finally:
        conn.close()


class SpaceWeatherSource(BaseSource):
    def __init__(self, client, redis_client, db_url: str, aurora_interval_s: int,
                 kp_interval_s: int, scales_interval_s: int = 900):
        super().__init__(client)
        self.redis_client     = redis_client
        self.db_url           = db_url
        self.aurora_interval  = aurora_interval_s
        self.kp_interval      = kp_interval_s
        self.scales_interval  = scales_interval_s
        self._seen_kp_times: set[str] = set()

    async def _get_last_fetch(self, key: str) -> float | None:
        if not self.redis_client:
            return None

        raw_value = await self.redis_client.get(key)
        if not raw_value:
            return None

        try:
            return float(raw_value)
        except (TypeError, ValueError):
            logger.warning("Space weather: invalid last-fetch timestamp in Redis key %s", key)
            return None

    async def _set_last_fetch(self, key: str, interval_s: int):
        if not self.redis_client:
            return

        await self.redis_client.set(key, str(datetime.now(UTC).timestamp()), ex=interval_s * 2)

    async def _wait_for_cooldown(self, key: str, interval_s: int, label: str) -> bool:
        last_fetch = await self._get_last_fetch(key)
        if last_fetch is None:
            logger.info("Space weather %s: no prior fetch timestamp — fetching immediately on startup.", label)
            return False

        now_ts = datetime.now(UTC).timestamp()
        elapsed = now_ts - last_fetch
        if elapsed >= interval_s:
            return False

        wait_sec = interval_s - elapsed
        logger.info(
            "Space weather %s: cooldown active (%.1fm / %.1fm). Next in %.1fm.",
            label,
            elapsed / 60,
            interval_s / 60,
            wait_sec / 60,
        )
        await asyncio.sleep(wait_sec)
        return True

    async def run(self):
        while True:
            try:
                if not await self._wait_for_cooldown(REDIS_KEY_KP_LAST_FETCH, self.kp_interval, "Kp"):
                    await self._poll_kp()
                    await self._set_last_fetch(REDIS_KEY_KP_LAST_FETCH, self.kp_interval)

                if not await self._wait_for_cooldown(REDIS_KEY_AURORA_LAST_FETCH, self.aurora_interval, "Aurora"):
                    await self._poll_aurora()
                    await self._set_last_fetch(REDIS_KEY_AURORA_LAST_FETCH, self.aurora_interval)

                if not await self._wait_for_cooldown(REDIS_KEY_SCALES_LAST_FETCH, self.scales_interval, "NOAA Scales"):
                    await self._poll_noaa_scales()
                    await self._set_last_fetch(REDIS_KEY_SCALES_LAST_FETCH, self.scales_interval)

            except Exception as exc:
                logger.exception("Space weather poll error")
                if self.redis_client:
                    try:
                        await self.redis_client.set(
                            "poller:space_weather:last_error",
                            json.dumps({"ts": datetime.now(UTC).timestamp(), "msg": str(exc)}),
                            ex=86400,
                        )
                    except Exception:
                        pass
                await asyncio.sleep(60)

    async def _fetch_json(self, url: str):
        resp = await self.fetch_with_retry(url)
        if not resp:
            raise httpx.RequestError(f"Failed to fetch {url} after retries")
        resp.raise_for_status()
        return resp.json()

    async def _poll_kp(self):
        logger.info("Polling Kp-index...")
        try:
            data = await self._fetch_json(KP_1M_URL)
        except Exception as exc:
            logger.error("Kp fetch failed: %s", exc)
            return

        records = []
        for row in data:
            if not isinstance(row, dict):
                continue
            time_tag = row.get("time_tag") or row.get("time")
            if not time_tag:
                continue
            try:
                kp_val = row.get("kp_index")
                if kp_val is None:
                    kp_val = row.get("estimated_kp", 0)
                if kp_val is None or isinstance(kp_val, str):
                    raw = str(row.get("kp", "0"))
                    numeric = "".join(c for c in raw if c.isdigit() or c == ".")
                    kp_val = float(numeric or 0)
                kp_frac = float(row.get("estimated_kp", kp_val) or kp_val)
                records.append({"time": time_tag, "kp": float(kp_val), "kp_fraction": kp_frac})
            except (TypeError, ValueError) as exc:
                logger.debug("Skipping invalid Kp row: %s", exc)

        if not records:
            logger.warning("No Kp records returned")
            return

        # Store latest + history in Redis
        latest = records[-1]
        kp_val = latest["kp"]
        storm  = _kp_to_storm_level(kp_val)
        current = {
            "kp": kp_val,
            "kp_fraction": latest.get("kp_fraction", kp_val),
            "storm_level": storm,
            "time": latest["time"],
            "fetched_at": datetime.now(UTC).isoformat(),
        }
        await self.redis_client.set("space_weather:kp_current", json.dumps(current))
        history = [
            {"time": r["time"], "kp": r["kp"], "storm_level": _kp_to_storm_level(r["kp"])}
            for r in records[-1440:]
        ]
        await self.redis_client.set("space_weather:kp_history", json.dumps(history))
        logger.info("Kp stored in Redis — latest: %.1f (%s)", kp_val, storm)

        # Persist new records to TimescaleDB
        new_records = [r for r in records if r["time"] not in self._seen_kp_times]
        if new_records:
            rows = [
                (r["time"], r["kp"], r.get("kp_fraction", r["kp"]),
                 _kp_to_storm_level(r["kp"]), "noaa_swpc_1m")
                for r in new_records
            ]
            try:
                await asyncio.to_thread(_store_kp_db_sync, self.db_url, rows)
                for r in new_records:
                    self._seen_kp_times.add(r["time"])
                if len(self._seen_kp_times) > 15_000:
                    self._seen_kp_times.clear()
                logger.info("Persisted %d Kp records to TimescaleDB", len(rows))
            except Exception as exc:
                logger.error("Kp DB write failed: %s", exc)

    async def _poll_aurora(self):
        logger.info("Polling Aurora GeoJSON...")
        try:
            data = await self._fetch_json(AURORA_URL)
        except Exception as exc:
            logger.error("Aurora fetch failed: %s", exc)
            return

        coords = data.get("coordinates", []) if isinstance(data, dict) else data
        if not coords:
            logger.warning("No aurora coordinates in response")
            return

        features = []
        for row in coords:
            if not isinstance(row, list) or len(row) < 3:
                continue
            try:
                lon       = float(row[0])
                lat       = float(row[1])
                intensity = float(row[2]) if row[2] is not None else 0.0
                if intensity < 5:
                    continue
                features.append({
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "properties": {"aurora": intensity},
                })
            except (TypeError, ValueError):
                continue

        geojson = {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "fetched_at": datetime.now(UTC).isoformat(),
                "observation_time": data.get("Observation Time") if isinstance(data, dict) else None,
            },
        }
        await self.redis_client.set("space_weather:aurora_geojson", json.dumps(geojson))
        logger.info("Aurora GeoJSON stored in Redis (%d points)", len(features))

    async def _poll_noaa_scales(self):
        """
        Poll NOAA Space Weather Scales (R/S/G event levels) and set the
        signal-loss suppression key when R3-R5 Radio Blackout or G3+
        Geomagnetic Storm is in effect.

        Redis keys written:
          space_weather:noaa_scales           — full scale payload, no TTL
          space_weather:suppress_signal_loss  — JSON suppression record, TTL=70 min
        """
        logger.info("Polling NOAA Scales...")
        try:
            data = await self._fetch_json(NOAA_SCALES_URL)
        except Exception as exc:
            logger.error("NOAA Scales fetch failed: %s", exc)
            return

        if not isinstance(data, dict):
            logger.warning("Unexpected NOAA Scales response type: %s", type(data))
            return

        # Store raw scales for the /alerts endpoint
        await self.redis_client.set("space_weather:noaa_scales", json.dumps(data))

        # Inspect current ("0") period
        current = data.get("0", {})
        if not current:
            logger.debug("No current-period NOAA Scales data")
            return

        r_scale_raw = str(current.get("R", {}).get("Scale", "0"))
        g_scale_raw = str(current.get("G", {}).get("Scale", "0"))
        s_scale_raw = str(current.get("S", {}).get("Scale", "0"))

        # Add prefix back if NOAA removed it (e.g., '3' -> 'R3')
        r_scale_str = r_scale_raw if r_scale_raw.startswith("R") else f"R{r_scale_raw}"
        g_scale_str = g_scale_raw if g_scale_raw.startswith("G") else f"G{g_scale_raw}"
        s_scale_str = s_scale_raw if s_scale_raw.startswith("S") else f"S{s_scale_raw}"

        r_level = _parse_scale_int(r_scale_str)
        g_level = _parse_scale_int(g_scale_str)

        radio_blackout_active     = r_level >= RADIO_BLACKOUT_THRESHOLD
        geomagnetic_storm_active  = g_level >= GEOMAGNETIC_STORM_THRESHOLD
        suppression_warranted     = radio_blackout_active or geomagnetic_storm_active

        if suppression_warranted:
            reasons = []
            if radio_blackout_active:
                reasons.append(f"{r_scale_str} Radio Blackout")
            if geomagnetic_storm_active:
                reasons.append(f"{g_scale_str} Geomagnetic Storm")
            reason_str = " + ".join(reasons)

            expires_at = (datetime.now(UTC) + timedelta(seconds=SUPPRESSION_TTL_SECONDS)).isoformat()
            suppression = {
                "active": True,
                "reason": reason_str,
                "r_scale": r_scale_str,
                "g_scale": g_scale_str,
                "expires_at": expires_at,
                "set_at": datetime.now(UTC).isoformat(),
            }
            await self.redis_client.setex(
                "space_weather:suppress_signal_loss",
                SUPPRESSION_TTL_SECONDS,
                json.dumps(suppression),
            )
            logger.warning(
                "Signal-loss suppression ACTIVE: %s (TTL=%ds)", reason_str, SUPPRESSION_TTL_SECONDS
            )
        else:
            logger.info(
                "NOAA Scales — R: %s  G: %s  S: %s — no suppression needed",
                r_scale_str, g_scale_str, s_scale_str,
            )

        logger.info("NOAA Scales stored in Redis")
