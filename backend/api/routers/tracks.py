import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK
from uvicorn.protocols.utils import ClientDisconnected
from core.database import db
from core.config import settings
from services.broadcast import broadcast_service

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

    # Option C+D: satellite entities are stored in orbital_tracks (no meta column).
    # Route by entity_id prefix so each query hits only one hypertable.
    if entity_id.startswith("SAT-"):
        query = """
            SELECT time, lat, lon, alt, speed, heading, NULL::jsonb AS meta
            FROM orbital_tracks
            WHERE entity_id = $1
            AND time > NOW() - INTERVAL '1 hour' * $2
            ORDER BY time DESC
            LIMIT $3
        """
    else:
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
        # Convert to dict to handle non-serializable types if any (asyncpg returns Record)
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

    # Option C+D: also search orbital_tracks for satellite entity IDs.
    # Orbital rows have no meta; callsign and classification come from satellites table.
    tracks_query = """
        SELECT DISTINCT ON (entity_id) entity_id, type, time as last_seen, lat, lon, meta
        FROM tracks
        WHERE entity_id ILIKE $1 OR meta->>'callsign' ILIKE $1
        ORDER BY entity_id, time DESC
        LIMIT $2
    """
    orbital_query = """
        SELECT DISTINCT ON (ot.entity_id)
            ot.entity_id,
            'a-s-K'::text        AS type,
            ot.time              AS last_seen,
            ot.lat,
            ot.lon,
            NULL::jsonb          AS meta,
            s.name               AS sat_name
        FROM orbital_tracks ot
        LEFT JOIN satellites s
            ON s.norad_id = SPLIT_PART(ot.entity_id, '-', 2)
        WHERE ot.entity_id ILIKE $1
        ORDER BY ot.entity_id, ot.time DESC
        LIMIT $2
    """
    try:
        tracks_rows, orbital_rows = await asyncio.gather(
            db.pool.fetch(tracks_query, f"%{q}%", limit),
            db.pool.fetch(orbital_query, f"%{q}%", limit),
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

        for row in orbital_rows:
            d = dict(row)
            d['callsign'] = d.pop('sat_name', None)
            d['classification'] = None
            d.pop('meta', None)
            results.append(d)

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
        ORDER BY time ASC
        LIMIT $3
    """
    try:
        rows = await db.pool.fetch(query, dt_start, dt_end, limit, bucket_interval)
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Replay query failed: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
