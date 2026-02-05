import os
import json
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import asyncpg
from litellm import completion
import time
import uuid
import asyncio
from datetime import datetime, timezone
from aiokafka import AIOKafkaConsumer
from websockets.exceptions import ConnectionClosedOK
from uvicorn.protocols.utils import ClientDisconnected
from proto.tak_pb2 import TakMessage, CotEvent, Detail, Contact, Track
import redis.asyncio as redis

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SovereignWatch")

# Config
DB_DSN = f"postgresql://{os.getenv('POSTGRES_USER', 'postgres')}:{os.getenv('POSTGRES_PASSWORD', 'password')}@sovereign-timescaledb:5432/{os.getenv('POSTGRES_DB', 'sovereign_watch')}"
REDIS_URL = f"redis://{os.getenv('REDIS_HOST', 'sovereign-redis')}:6379"
LITELLM_MODEL = "deep-reasoner" # Map to config alias

app = FastAPI(title="Sovereign Watch API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Connection Pool
pool: Optional[asyncpg.Pool] = None
redis_client: Optional[redis.Redis] = None

@app.on_event("startup")
async def startup():
    global pool, redis_client
    pool = await asyncpg.create_pool(DB_DSN)
    redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
    logger.info("Database and Redis connections established")

@app.on_event("shutdown")
async def shutdown():
    if pool:
        await pool.close()
    if redis_client:
        await redis_client.close()

# Models
class AnalyzeRequest(BaseModel):
    uid: str
    lookback_hours: int = 24

class MissionLocation(BaseModel):
    lat: float
    lon: float
    radius_nm: int

# Endpoints
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/api/config/location")
async def set_mission_location(location: MissionLocation):
    """
    Update the active surveillance area.
    Publishes to Redis pub/sub to notify all pollers.
    """
    if not redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")
    
    # Validate constraints
    if location.radius_nm < 10 or location.radius_nm > 300:
        raise HTTPException(status_code=400, detail="Radius must be between 10 and 300 nautical miles")
    
    if not (-90 <= location.lat <= 90):
        raise HTTPException(status_code=400, detail="Invalid latitude")
    
    if not (-180 <= location.lon <= 180):
        raise HTTPException(status_code=400, detail="Invalid longitude")
    
    # Store in Redis
    mission_data = {
        "lat": location.lat,
        "lon": location.lon,
        "radius_nm": location.radius_nm,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await redis_client.set("mission:active", json.dumps(mission_data))
    
    # Publish update to subscribers (pollers)
    await redis_client.publish("navigation-updates", json.dumps(mission_data))
    
    logger.info(f"Mission location updated: {location.lat}, {location.lon} ({location.radius_nm}nm)")
    
    return {"status": "ok", "active_mission": mission_data}

@app.get("/api/config/location")
async def get_mission_location():
    """
    Retrieve the current active surveillance area.
    If not set, returns Docker ENV defaults.
    """
    if not redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")
    
    mission_json = await redis_client.get("mission:active")
    
    if mission_json:
        return json.loads(mission_json)
    
    # Fallback to ENV defaults
    default_mission = {
        "lat": float(os.getenv("CENTER_LAT", "45.5152")),
        "lon": float(os.getenv("CENTER_LON", "-122.6784")),
        "radius_nm": int(os.getenv("COVERAGE_RADIUS_NM", "150")),
        "updated_at": None
    }
    
    return default_mission
    return {"status": "ok"}

@app.post("/api/analyze/{uid}")
async def analyze_track(uid: str, req: AnalyzeRequest):
    """
    Fusion Analysis Endpoint:
    1. Fetch Track History (Hard Data)
    2. Fetch Intel Reports (Soft Data)
    3. Generate AI Assessment (Cognition)
    """
    if not pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    # 1. Fetch Track History Summary
    # We aggregate to reduce tokens: Start/End location, bounding box, avg speed/alt
    track_query = """
        SELECT 
            min(time) as start_time,
            max(time) as last_seen,
            count(*) as points,
            avg(speed) as avg_speed,
            avg(alt) as avg_alt,
            ST_AsText(ST_Centroid(ST_Collect(geom))) as centroid
        FROM tracks 
        WHERE entity_id = $1 
        AND time > NOW() - INTERVAL '1 hour' * $2
    """
    track_summary = await pool.fetchrow(track_query, uid, req.lookback_hours)
    
    if not track_summary or track_summary['points'] == 0:
        return {"error": "No track data found for this entity within lookback period"}

    # 2. Fetch Contextual Intel
    # Calling the SQL function we defined in init.sql
    intel_query = """
        SELECT content, distance 
        FROM get_contextual_intel(
            (SELECT embedding FROM intel_reports LIMIT 1), -- Placeholder: Real app needs query embedding generation
            50000, -- 50km
            ST_GeomFromText($1, 4326)
        )
    """
    # Note: In a real implementation, we need to generate an embedding for the "Query"
    # "What is suspicious about this track?" -> Vector
    # For now, we'll demonstrate the logic flow. 
    # To fix logic: We need an embedding service. LiteLLM embedding() call.
    
    # Let's generate a query embedding using LiteLLM (Optional, or just mock for V1)
    # response = completion(model="text-embedding-3-small", input=["suspicious activity"])
    # query_vec = response['data'][0]['embedding']
    
    # For this MVP, we will skip the vector query *execution* in python if we don't have the embedding model 
    # ready in the docker stack configs. 
    # We will pass a textual summary of reports if we had them.
    intel_reports = [] # Mock for now
    
    # 3. Construct Prompt
    system_prompt = """
    You are a Senior Intelligence Analyst. You are viewing a map of a decentralized sensor network.
    Analyze the provided track telemetry and correlated intelligence reports.
    Identify anomalies (erratic flight, dark AIS, mismatches).
    Return a concise tactical summary.
    """
    
    user_content = f"""
    TARGET: {uid}
    TELEMETRY SUMMARY ({req.lookback_hours}h):
    - Points: {track_summary['points']}
    - Avg Speed: {track_summary['avg_speed']:.1f} m/s
    - Avg Alt: {track_summary['avg_alt']:.0f} m
    - Last Seen: {track_summary['last_seen']}
    
    INTELLIGENCE CONTEXT:
    {json.dumps(intel_reports)}
    
    ASSESSMENT:
    """

    # 4. Stream AI Response
    async def event_generator():
        response = completion(
            model=LITELLM_MODEL, 
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            stream=True
        )
        for chunk in response:
            content = chunk.choices[0].delta.content or ""
            if content:
                yield {"data": content}

    return EventSourceResponse(event_generator())


@app.websocket("/api/tracks/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Initialize Kafka Consumer
    # Use unique group_id per client so every user gets ALL data (Broadcast)
    # and to prevent rebalancing loops when multiple clients connect.
    client_id = f"api-client-{uuid.uuid4().hex[:8]}"
    
    # Subscribe to BOTH aviation and maritime topics
    consumer = AIOKafkaConsumer(
        "adsb_raw", "ais_raw",  # Multi-topic subscription
        bootstrap_servers='sovereign-redpanda:9092',
        group_id=client_id,
        auto_offset_reset="latest"  # Only new data
    )

    
    try:
        await consumer.start()
        logger.info(f"Kafka Consumer started for {client_id}")
        
        async for msg in consumer:
            try:
                data = json.loads(msg.value.decode('utf-8'))
                
                # Transform JSON to TAK Proto
                tak_msg = TakMessage()
                cot = tak_msg.cotEvent
                
                # Helper for timestamps (Handle ISO string or numbers)
                def to_epoch(val):
                    if val is None: return 0
                    if isinstance(val, (int, float)): return int(val)
                    if isinstance(val, str):
                        try:
                            # Simple ISO check (Python 3.11+)
                            dt = datetime.fromisoformat(val.replace('Z', '+00:00'))
                            return int(dt.timestamp() * 1000)
                        except ValueError:
                            pass
                    return 0

                def to_float(val, default=0.0):
                    if val is None: return default
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        return default

                # 1. Root Fields
                cot.uid = str(data.get("uid", "unknown"))
                cot.type = str(data.get("type", "a-u-G"))
                cot.start = to_epoch(data.get("start"))
                cot.stale = to_epoch(data.get("stale"))
                cot.time = to_epoch(data.get("time"))
                cot.how = str(data.get("how", "m-g"))
                
                # 2. Point Data
                point = data.get("point", {})
                cot.lat = to_float(point.get("lat"))
                cot.lon = to_float(point.get("lon"))
                cot.hae = to_float(point.get("hae"))
                cot.ce = to_float(point.get("ce"), 9999.0)
                cot.le = to_float(point.get("le"), 9999.0)
                
                # 3. Details
                src_detail = data.get("detail", {})
                
                # Track
                src_track = src_detail.get("track", {})
                cot.detail.track.course = to_float(src_track.get("course"))
                cot.detail.track.speed = to_float(src_track.get("speed"))
                
                # Contact
                src_contact = src_detail.get("contact", {})
                cot.detail.contact.callsign = str(src_contact.get("callsign", cot.uid))
                
                # Serialize
                payload = tak_msg.SerializeToString()
                
                # Magic Bytes (0xbf 0x01 0xbf)
                magic = bytes([0xbf, 0x01, 0xbf])
                
                # Send Binary
                await websocket.send_bytes(magic + payload)
                
                # Debug Log (Sampled)
                if int(time.time()) % 10 == 0: 
                     logger.info(f"Sent TAK Message: {cot.uid} -> {cot.type}")
                
            except (WebSocketDisconnect, ConnectionClosedOK, ClientDisconnected):
                logger.info(f"Client {client_id} disconnected during send")
                break
            except Exception as e:
                logger.error(f"Error processing message: {e}", exc_info=True)
                logger.error(f"Faulty Payload: {msg.value}")
                continue
                
    except (WebSocketDisconnect, ConnectionClosedOK, ClientDisconnected):
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"WebSocket Loop failed: {e}")
    finally:
        await consumer.stop()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
