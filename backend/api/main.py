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
from proto.tak_pb2 import TakMessage, CotEvent, Detail, Contact, Track, Classification
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
historian_task_handle: Optional[asyncio.Task] = None

async def historian_task():
    """
    Background task to consume Kafka messages and persist them to TimescaleDB.
    Runs independently of the WebSocket consumers.
    """
    logger.info("📜 Historian task started")
    consumer = AIOKafkaConsumer(
        "adsb_raw", "ais_raw",
        bootstrap_servers='sovereign-redpanda:9092',
        group_id="historian-writer",
        auto_offset_reset="latest"
    )
    
    try:
        await consumer.start()
        
        batch = []
        last_flush = time.time()
        BATCH_SIZE = 100
        FLUSH_INTERVAL = 2.0
        
        # PostGIS Geometry Insert: ST_SetSRID(ST_MakePoint(lon, lat), 4326)
        insert_sql = """
            INSERT INTO tracks (time, entity_id, type, lat, lon, alt, speed, heading, meta, geom)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_SetSRID(ST_MakePoint($5, $4), 4326))
        """
        
        async for msg in consumer:
            try:
                data = json.loads(msg.value.decode('utf-8'))
                
                # --- Parsing Logic (Mirrors WebSocket logic but simplified) ---
                
                # Time: Prefer 'time' (ms), fallback to 'start' (epoch s or iso), fallback to now
                ts_val = data.get("time")
                if isinstance(ts_val, (int, float)):
                    ts = datetime.fromtimestamp(ts_val / 1000.0, tz=timezone.utc)
                else:
                    ts = datetime.now(timezone.utc)

                uid = str(data.get("uid", "unknown"))
                etype = str(data.get("type", "a-u-G"))
                
                point = data.get("point", {})
                lat = float(point.get("lat") or 0.0)
                lon = float(point.get("lon") or 0.0)
                alt = float(point.get("hae") or 0.0)
                
                detail = data.get("detail", {})
                track = detail.get("track", {})
                speed = float(track.get("speed") or 0.0)
                heading = float(track.get("course") or 0.0)
                
                # Meta: Store contact info and other details for search/context
                # We store 'callsign' explicitly in meta for easier searching
                contact = detail.get("contact", {})
                callsign = contact.get("callsign") or uid
                
                # NEW: Capture classification in meta for historical search enrichment
                classification = detail.get("classification", {})
                
                meta = json.dumps({
                    "callsign": callsign,
                    "how": data.get("how"),
                    "ce": point.get("ce"),
                    "le": point.get("le"),
                    "classification": classification
                })
                
                batch.append((ts, uid, etype, lat, lon, alt, speed, heading, meta))
                
                # --- Batch Flush Logic ---
                now = time.time()
                if len(batch) >= BATCH_SIZE or (now - last_flush > FLUSH_INTERVAL and batch):
                    if pool:
                        try:
                            async with pool.acquire() as conn:
                                await conn.executemany(insert_sql, batch)
                            # logger.info(f"Historian: wrote {len(batch)} rows") 
                        except Exception as db_err:
                            logger.error(f"Historian DB Error: {db_err}")
                            
                    batch = []
                    last_flush = now
                    
            except Exception as e:
                logger.error(f"Historian message processing error: {e}")
                continue
                
    except asyncio.CancelledError:
        logger.info("Historian task cancelled")
    except Exception as e:
        logger.error(f"Historian Fatal Error: {e}")
    finally:
        await consumer.stop()
        logger.info("Historian consumer stopped")


@app.on_event("startup")
async def startup():
    global pool, redis_client, historian_task_handle
    pool = await asyncpg.create_pool(DB_DSN)
    redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
    
    # Start Historian
    historian_task_handle = asyncio.create_task(historian_task())
    
    logger.info("Database, Redis, and Historian started")

@app.on_event("shutdown")
async def shutdown():
    global historian_task_handle
    if historian_task_handle:
        historian_task_handle.cancel()
        try:
            await historian_task_handle
        except asyncio.CancelledError:
            pass
            
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
                cot.detail.track.vspeed = to_float(src_track.get("vspeed"))
                
                # Contact
                src_contact = src_detail.get("contact", {})
                cot.detail.contact.callsign = str(src_contact.get("callsign", cot.uid))
                
                # Classification
                src_class = src_detail.get("classification", {})
                if src_class:
                    cls = cot.detail.classification
                    cls.affiliation = str(src_class.get("affiliation", ""))
                    cls.platform = str(src_class.get("platform", ""))
                    cls.size_class = str(src_class.get("size", "")) # size in JSON, size_class in Proto
                    cls.icao_type = str(src_class.get("icaoType", ""))
                    cls.category = str(src_class.get("category", ""))
                    cls.db_flags = int(src_class.get("dbFlags") or 0)
                    cls.operator = str(src_class.get("operator", ""))
                    cls.registration = str(src_class.get("registration", ""))
                    cls.description = str(src_class.get("description", ""))
                    cls.squawk = str(src_class.get("squawk", ""))
                    cls.emergency = str(src_class.get("emergency", ""))
                
                # Vessel Classification
                src_vessel = src_detail.get("vesselClassification", {})
                if src_vessel:
                    vc = cot.detail.vesselClassification
                    vc.category = str(src_vessel.get("category", ""))
                    vc.ship_type = int(src_vessel.get("shipType", 0))
                    vc.nav_status = int(src_vessel.get("navStatus", 15))
                    vc.hazardous = bool(src_vessel.get("hazardous", False))
                    vc.station_type = str(src_vessel.get("stationType", ""))
                    vc.flag_mid = int(src_vessel.get("flagMid", 0))
                    vc.imo = int(src_vessel.get("imo", 0))
                    vc.callsign = str(src_vessel.get("callsign", ""))
                    vc.destination = str(src_vessel.get("destination", ""))
                    vc.draught = to_float(src_vessel.get("draught"))
                    vc.length = to_float(src_vessel.get("length"))
                    vc.beam = to_float(src_vessel.get("beam"))
                
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

# --- Historical Data Endpoints ---

@app.get("/api/tracks/history/{entity_id}")
async def get_track_history(entity_id: str, limit: int = 100, hours: int = 24):
    """
    Get raw track points for a specific entity.
    """
    if not pool:
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
        rows = await pool.fetch(query, entity_id, float(hours), limit)
        # Convert to dict to handle non-serializable types if any (asyncpg returns Record)
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"History query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tracks/search")
async def search_tracks(q: str, limit: int = 10):
    """
    Search for entities by ID or Callsign (substring).
    Returns the most recent position for each match.
    """
    if not pool:
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
        rows = await pool.fetch(query, f"%{q}%", limit)
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
                except:
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

@app.get("/api/tracks/replay")
async def replay_tracks(start: str, end: str):
    """
    Get all track points within a time window for replay.
    Timestamps must be ISO 8601.
    """
    if not pool:
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
        rows = await pool.fetch(query, dt_start, dt_end)
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error(f"Replay query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
