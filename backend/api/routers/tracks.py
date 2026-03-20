import asyncio
import json
import logging
import math
import os
import time as time_module
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK
from uvicorn.protocols.utils import ClientDisconnected
import httpx
import numpy as np
from sgp4.api import Satrec, jday as sgp4_jday
from core.database import db
from core.config import settings
from services.broadcast import broadcast_service
from utils.sgp4_utils import teme_to_ecef, ecef_to_lla_vectorized


def _jday(dt: datetime):
    """Return (jd, fr) tuple from a UTC datetime for SGP4."""
    return sgp4_jday(dt.year, dt.month, dt.day, dt.hour, dt.minute,
                     dt.second + dt.microsecond / 1e6)

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Tracks")

@router.websocket("/api/tracks/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = f"api-client-{uuid.uuid4().hex[:8]}"

    # Register with Broadcast Service
    await broadcast_service.connect(websocket)
    logger.info(f"Client {client_id} connected")

    try:
        while True:
            # Wait for client to close connection or send a message (ignored)
            await websocket.receive_text()
    except (WebSocketDisconnect, ConnectionClosedOK, ClientDisconnected):
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket Loop failed for {client_id}: {e}")
    finally:
        await broadcast_service.disconnect(websocket)

@router.get("/api/tracks/history/{entity_id}")
async def get_track_history(entity_id: str, limit: int = 100, hours: int = 24):
    """
    Get raw track points for a specific entity.
    """
    if limit > settings.TRACK_HISTORY_MAX_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Limit exceeds maximum allowed ({settings.TRACK_HISTORY_MAX_LIMIT})"
        )

    if hours > settings.TRACK_HISTORY_MAX_HOURS:
        raise HTTPException(
            status_code=400,
            detail=f"Hours exceeds maximum allowed ({settings.TRACK_HISTORY_MAX_HOURS})"
        )

    # BUG-007: Reject zero or negative values which would produce nonsensical queries
    if limit <= 0 or hours <= 0:
        raise HTTPException(
            status_code=400,
            detail="limit and hours must be positive integers"
        )

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    if entity_id.startswith("SAT-"):
        # Satellite positions are no longer stored in a database hypertable.
        # They are deterministic and computed on-demand via SGP4 from the current
        # TLE in the `satellites` table.  This eliminates ~2 000 rows/sec of writes
        # while giving unlimited historical reach (bounded only by TLE age).
        norad_id = entity_id[4:]  # "SAT-25544" → "25544"
        async with db.pool.acquire() as conn:
            sat = await conn.fetchrow(
                "SELECT tle_line1, tle_line2 FROM satellites WHERE norad_id = $1",
                norad_id,
            )
        if not sat:
            return []

        try:
            satrec = Satrec.twoline2rv(sat["tle_line1"], sat["tle_line2"])
        except Exception as e:
            logger.error(f"Malformed TLE for {entity_id}: {e}")
            return []

        # Walk backward from now in equal steps; step size ensures we hit `limit`
        # points exactly across the requested window.
        total_seconds = hours * 3600
        step_seconds = max(10, total_seconds // limit)
        end_dt = datetime.now(timezone.utc)

        results = []
        t = end_dt
        while t >= end_dt - timedelta(hours=hours) and len(results) < limit:
            jd, fr = _jday(t)
            e, r, v = satrec.sgp4(jd, fr)
            if e == 0:
                r_ecef = teme_to_ecef(np.array(r), jd, fr)
                lat_arr, lon_arr, alt_arr = ecef_to_lla_vectorized(r_ecef.reshape(1, 3))

                # Heading: bearing from 1 second ago to now
                t_prev = t - timedelta(seconds=1)
                jd2, fr2 = _jday(t_prev)
                e2, r2, _ = satrec.sgp4(jd2, fr2)
                heading = 0.0
                if e2 == 0:
                    r2_ecef = teme_to_ecef(np.array(r2), jd2, fr2)
                    la2, lo2, _ = ecef_to_lla_vectorized(r2_ecef.reshape(1, 3))
                    dlat = float(lat_arr[0]) - float(la2[0])
                    dlon = float(lon_arr[0]) - float(lo2[0])
                    heading = math.degrees(
                        math.atan2(
                            dlon * math.cos(math.radians(float(lat_arr[0]))),
                            dlat,
                        )
                    ) % 360.0

                results.append({
                    "time": t,
                    "lat": round(float(lat_arr[0]), 5),
                    "lon": round(float(lon_arr[0]), 5),
                    "alt": round(float(alt_arr[0]) * 1000.0, 1),   # km → m
                    "speed": round(float(np.linalg.norm(v)) * 1000.0, 2),  # km/s → m/s
                    "heading": round(heading, 2),
                    "meta": None,
                })
            t -= timedelta(seconds=step_seconds)

        return results  # already ordered DESC (newest first)

    # ADS-B / AIS entities → tracks hypertable
    query = """
        SELECT time, lat, lon, alt, speed, heading, meta
        FROM tracks
        WHERE entity_id = $1
        AND time > NOW() - INTERVAL '1 hour' * $2
        ORDER BY time DESC
        LIMIT $3
    """
    try:
        rows = await db.pool.fetch(query, entity_id, float(hours), limit)
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"History query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/api/tracks/search")
async def search_tracks(q: str, limit: int = 10):
    """
    Search for entities by ID or Callsign (substring).
    Returns the most recent position for each match.
    """
    if limit > settings.TRACK_SEARCH_MAX_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Limit exceeds maximum allowed ({settings.TRACK_SEARCH_MAX_LIMIT})"
        )

    if limit <= 0:
        raise HTTPException(
            status_code=400,
            detail="limit must be a positive integer"
        )

    if len(q) > 100:
        raise HTTPException(
            status_code=400,
            detail="Query string is too long"
        )

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    if len(q) < 2:
        return []

    # Search ADS-B / AIS tracks by entity_id or callsign
    tracks_query = """
        SELECT DISTINCT ON (entity_id) entity_id, type, time as last_seen, lat, lon, meta
        FROM tracks
        WHERE entity_id ILIKE $1 OR meta->>'callsign' ILIKE $1
        ORDER BY entity_id, time DESC
        LIMIT $2
    """
    # Search satellites catalogue by NORAD entity UID ("SAT-<id>") or name.
    # Positions are computed on-demand via SGP4 rather than read from a
    # now-removed orbital_tracks hypertable.
    satellites_query = """
        SELECT norad_id, name, tle_line1, tle_line2
        FROM satellites
        WHERE ('SAT-' || norad_id) ILIKE $1 OR name ILIKE $1
        LIMIT $2
    """
    try:
        tracks_rows, sat_rows = await asyncio.gather(
            db.pool.fetch(tracks_query, f"%{q}%", limit),
            db.pool.fetch(satellites_query, f"%{q}%", limit),
        )
        results = []

        for row in tracks_rows:
            d = dict(row)
            meta_json = d.get('meta')
            if meta_json:
                try:
                    meta = json.loads(meta_json)
                    d['callsign'] = meta.get('callsign')
                    d['classification'] = meta.get('classification')
                except Exception:
                    d['callsign'] = None
                    d['classification'] = None
            else:
                d['callsign'] = None
                d['classification'] = None
            d.pop('meta', None)
            results.append(d)

        # For each matched satellite compute its current position via SGP4
        now = datetime.now(timezone.utc)
        for row in sat_rows:
            lat, lon = None, None
            try:
                satrec = Satrec.twoline2rv(row["tle_line1"], row["tle_line2"])
                jd, fr = _jday(now)
                e, r, _ = satrec.sgp4(jd, fr)
                if e == 0:
                    r_ecef = teme_to_ecef(np.array(r), jd, fr)
                    la, lo, _ = ecef_to_lla_vectorized(r_ecef.reshape(1, 3))
                    lat = round(float(la[0]), 5)
                    lon = round(float(lo[0]), 5)
            except Exception:
                pass
            results.append({
                "entity_id": f"SAT-{row['norad_id']}",
                "type": "a-s-K",
                "last_seen": now,
                "lat": lat,
                "lon": lon,
                "callsign": row["name"],
                "classification": None,
            })

        return results
    except Exception as e:
        logger.error(f"Search query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/api/tracks/replay")
async def replay_tracks(start: str, end: str, limit: int = 1000):
    """
    Get all track points within a time window for replay.
    Timestamps must be ISO 8601.
    """
    if limit > settings.TRACK_REPLAY_MAX_LIMIT:
        raise HTTPException(
            status_code=400,
            detail=f"Limit exceeds maximum allowed ({settings.TRACK_REPLAY_MAX_LIMIT})"
        )

    # NEW-004: Mirror the BUG-007 lower-bound guard from the history endpoint.
    # limit=0 silently returns 0 rows; negative values may cause asyncpg errors.
    if limit <= 0:
        raise HTTPException(
            status_code=400,
            detail="limit must be a positive integer"
        )

    try:
        # Pydantic/FastAPI handles some ISO parsing, but we need robust handling
        dt_start = datetime.fromisoformat(start.replace('Z', '+00:00'))
        dt_end = datetime.fromisoformat(end.replace('Z', '+00:00'))

        # Validate time window
        duration_hours = (dt_end - dt_start).total_seconds() / 3600
        # BUG-006: A negative duration means dt_end < dt_start. Without this check
        # the value is always < MAX_HOURS so the window guard is silently bypassed.
        if dt_end <= dt_start:
            logger.warning(f"Replay request rejected: end ({dt_end}) is not after start ({dt_start})")
            raise HTTPException(status_code=400, detail="end must be after start")
        if duration_hours > settings.TRACK_REPLAY_MAX_HOURS:
            raise HTTPException(
                status_code=400,
                detail=f"Time range exceeds maximum allowed ({settings.TRACK_REPLAY_MAX_HOURS} hours)"
            )
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid ISO8601 timestamp format")

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    # Adaptive time-bucket sampling: instead of a raw LIMIT that always returns
    # the first N chronological rows (often just a few seconds of a long window),
    # we bucket time by entity so the full window is covered evenly.
    # Bucket size grows with window duration; capped at 5 min so the frontend
    # 5-min stale-threshold never hides a live entity between buckets.
    bucket_seconds: int
    if duration_hours <= 1:
        bucket_seconds = 30
    elif duration_hours <= 2:
        bucket_seconds = 60
    elif duration_hours <= 6:
        bucket_seconds = 120
    elif duration_hours <= 12:
        bucket_seconds = 180
    else:
        bucket_seconds = 300  # 5 min cap — matches frontend stale threshold

    bucket_interval = timedelta(seconds=bucket_seconds)

    # Replay covers ADS-B and AIS data only.
    # Orbital (satellite) tracks are excluded for two reasons:
    #   1. The OrbitalMap is hardcoded to replayMode=false — orbital points
    #      returned here are never rendered anywhere.
    #   2. With ~10 000 tracked satellites, even one bucket per object would
    #      exhaust the entire row budget, leaving no room for AIS/ADS-B data.
    # Satellite positions are deterministic (SGP4 from stored TLEs) and can be
    # recomputed on demand, so historical storage is not needed for replay.
    query = """
        SELECT * FROM (
            SELECT DISTINCT ON (entity_id, time_bucket($4::interval, time))
                time_bucket($4::interval, time) AS time,
                entity_id, type, lat, lon, alt, speed, heading, meta
            FROM tracks
            WHERE time >= $1 AND time <= $2
            ORDER BY entity_id, time_bucket($4::interval, time), time DESC
        ) s
        -- ORDER BY time DESC so that LIMIT $3 retains the NEWEST rows rather
        -- than the oldest.  Without this, a dense deployment with many entities
        -- fills the row budget with the earliest portion of the window and the
        -- most recent tracks are silently dropped.  The frontend re-sorts each
        -- entity's history array ascending before binary-search playback.
        ORDER BY time DESC
        LIMIT $3
    """
    try:
        rows = await db.pool.fetch(query, dt_start, dt_end, limit, bucket_interval)
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Replay query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/tracks/flight-info/{entity_id}")
async def get_flight_info(entity_id: str):
    """
    Fetch the most recent departure/arrival airport for an aircraft from the
    OpenSky flights API.  entity_id is the ICAO24 hex string (lowercase).

    Returns:
        departure: ICAO airport code of estimated departure (or null)
        arrival:   ICAO airport code of estimated arrival (or null)
        callsign:  Flight callsign from OpenSky (or null)
        first_seen: Unix timestamp of takeoff
        last_seen:  Unix timestamp of landing
    """
    # Satellites and non-ICAO24 entities are not supported
    if entity_id.startswith("SAT-") or entity_id.startswith("infra-"):
        return {"departure": None, "arrival": None, "callsign": None,
                "first_seen": None, "last_seen": None}

    end_ts = int(time_module.time())
    begin_ts = end_ts - 7 * 24 * 3600  # 7-day lookback

    client_id = os.getenv("OPENSKY_CLIENT_ID")
    client_secret = os.getenv("OPENSKY_CLIENT_SECRET")

    url = "https://opensky-network.org/api/flights/aircraft"
    params = {"icao24": entity_id.lower(), "begin": begin_ts, "end": end_ts}
    auth = (client_id, client_secret) if client_id and client_secret else None

    empty = {"departure": None, "arrival": None, "callsign": None,
             "first_seen": None, "last_seen": None}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await (
                client.get(url, params=params, auth=auth)
                if auth else
                client.get(url, params=params)
            )
        if resp.status_code != 200:
            logger.debug(f"OpenSky flights API returned {resp.status_code} for {entity_id}")
            return empty

        flights = resp.json()
        if not flights:
            return empty

        # Return the most recently completed flight
        latest = max(flights, key=lambda f: f.get("lastSeen") or 0)
        return {
            "departure": latest.get("estDepartureAirport"),
            "arrival": latest.get("estArrivalAirport"),
            "callsign": (latest.get("callsign") or "").strip() or None,
            "first_seen": latest.get("firstSeen"),
            "last_seen": latest.get("lastSeen"),
        }
    except Exception as e:
        logger.warning(f"OpenSky flights API error for {entity_id}: {e}")
        return empty
