import json
import logging
import uuid
from datetime import datetime
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

    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

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
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/tracks/search")
async def search_tracks(q: str, limit: int = 10):
    """
    Search for entities by ID or Callsign (substring).
    Returns the most recent position for each match.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    if len(q) < 2:
        return []

    query = """
        SELECT DISTINCT ON (entity_id) entity_id, type, time as last_seen, lat, lon, meta
        FROM tracks
        WHERE entity_id ILIKE $1 OR meta->>'callsign' ILIKE $1
        ORDER BY entity_id, time DESC
        LIMIT $2
    """
    try:
        rows = await db.pool.fetch(query, f"%{q}%", limit)
        results = []
        for row in rows:
            d = dict(row)
            # Parse meta to extract callsign for convenience
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

            # Clean up response
            d.pop('meta', None)
            results.append(d)
        return results
    except Exception as e:
        logger.error(f"Search query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/tracks/replay")
async def replay_tracks(start: str, end: str):
    """
    Get all track points within a time window for replay.
    Timestamps must be ISO 8601.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    try:
        # Pydantic/FastAPI handles some ISO parsing, but we need robust handling
        dt_start = datetime.fromisoformat(start.replace('Z', '+00:00'))
        dt_end = datetime.fromisoformat(end.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ISO8601 timestamp format")

    query = """
        SELECT time, entity_id, type, lat, lon, alt, speed, heading, meta
        FROM tracks
        WHERE time >= $1 AND time <= $2
        ORDER BY time ASC
    """
    try:
        rows = await db.pool.fetch(query, dt_start, dt_end)
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Replay query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
