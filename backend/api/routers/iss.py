"""
ISS real-time tracking router.

Endpoints:
  GET /api/infrastructure/iss/position   — latest cached position (REST polling)
  GET /api/infrastructure/iss/track      — last N positions from DB (ground track)
  WS  /ws/infrastructure/iss-stream      — live 5-second position stream via Redis pub/sub
"""

import asyncio
import json
import logging

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
from uvicorn.protocols.utils import ClientDisconnected

from core.auth import authenticate_websocket
from core.config import settings
from core.database import db

router = APIRouter()
logger = logging.getLogger("SovereignWatch.ISS")

_REDIS_CHANNEL = "infrastructure:iss-position"
_REDIS_LATEST_KEY = "infra:iss_latest"


@router.get("/api/infrastructure/iss/position")
async def get_iss_position():
    """Return the latest ISS position cached by the poller (≤60s old)."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    try:
        data = await db.redis_client.get(_REDIS_LATEST_KEY)
        if not data:
            raise HTTPException(
                status_code=503, detail="ISS position not yet available"
            )
        return json.loads(data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error fetching ISS position: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/api/infrastructure/iss/track")
async def get_iss_track(points: int = 720):
    """Return the last N ISS positions from the archive (default 720 ≈ 1 orbit at 5s cadence)."""
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not connected")

    points = max(1, min(points, 5760))  # cap at ~8 hours

    query = """
    SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
            json_build_object(
                'type', 'Feature',
                'geometry', ST_AsGeoJSON(geom)::json,
                'properties', json_build_object(
                    'timestamp',    time,
                    'altitude_km',  altitude_km,
                    'velocity_kms', velocity_kms
                )
            )
            ORDER BY time DESC
        ), '[]'::json)
    )
    FROM (
        SELECT time, lat, lon, altitude_km, velocity_kms, geom
        FROM iss_positions
        ORDER BY time DESC
        LIMIT $1
    ) sub;
    """

    try:
        async with db.pool.acquire() as conn:
            result = await conn.fetchval(query, points)
            if not result:
                return {"type": "FeatureCollection", "features": []}
            return json.loads(result)
    except Exception as e:
        logger.error("Error fetching ISS track: %s", e)
        raise HTTPException(status_code=500, detail="Database error")


@router.websocket("/ws/infrastructure/iss-stream")
async def iss_websocket(
    websocket: WebSocket,
    token: str | None = Query(default=None),
):
    """Stream live ISS position updates (~5s cadence) via Redis pub/sub."""
    user = await authenticate_websocket(websocket, token)
    if user is None:
        return

    logger.info(
        f"ISS WebSocket client connected: {user.get('username', user.get('id', 'unknown'))}"
    )

    redis_url = f"redis://{settings.REDIS_HOST}:6379"
    pubsub_client: aioredis.Redis | None = None

    try:
        pubsub_client = await aioredis.from_url(redis_url, decode_responses=True)
        pubsub = pubsub_client.pubsub()
        await pubsub.subscribe(_REDIS_CHANNEL)

        # Send the current position immediately so the client doesn't wait up to 5s
        if db.redis_client:
            latest = await db.redis_client.get(_REDIS_LATEST_KEY)
            if latest:
                await websocket.send_text(latest)

        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    await websocket.send_text(message["data"])
                except (
                    WebSocketDisconnect,
                    ConnectionClosedOK,
                    ConnectionClosedError,
                    ClientDisconnected,
                ):
                    break
                except Exception as e:
                    logger.error("ISS WS send error: %s", e)
                    break

    except (
        WebSocketDisconnect,
        ConnectionClosedOK,
        ConnectionClosedError,
        ClientDisconnected,
    ):
        pass
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error("ISS WebSocket error: %s", e)
    finally:
        if pubsub_client:
            try:
                await pubsub_client.aclose()
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("ISS WebSocket client disconnected")
