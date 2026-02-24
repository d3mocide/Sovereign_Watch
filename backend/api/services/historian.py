import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from aiokafka import AIOKafkaConsumer
from core.database import db

logger = logging.getLogger("SovereignWatch.Historian")

async def historian_task():
    """
    Background task to consume Kafka messages and persist them to TimescaleDB.
    Runs independently of the WebSocket consumers.
    """
    logger.info("📜 Historian task started")
    consumer = AIOKafkaConsumer(
        "adsb_raw", "ais_raw", "orbital_raw",
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
                    if db.pool:
                        try:
                            async with db.pool.acquire() as conn:
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
