import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from aiokafka import AIOKafkaConsumer
from core.database import db
from core.config import settings

logger = logging.getLogger("SovereignWatch.Historian")

async def historian_task():
    """
    Background task to consume Kafka messages and persist them to TimescaleDB.
    Runs independently of the WebSocket consumers.
    """
    logger.info("📜 Historian task started")
    consumer = AIOKafkaConsumer(
        "adsb_raw", "ais_raw", "orbital_raw", "rf_raw",
        bootstrap_servers=settings.KAFKA_BROKERS,
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

        satellite_upsert_sql = """
            INSERT INTO satellites (norad_id, name, category, constellation, tle_line1, tle_line2,
                                    period_min, inclination_deg, eccentricity, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (norad_id) DO UPDATE SET
                tle_line1       = EXCLUDED.tle_line1,
                tle_line2       = EXCLUDED.tle_line2,
                name            = EXCLUDED.name,
                category        = EXCLUDED.category,
                constellation   = EXCLUDED.constellation,
                period_min      = EXCLUDED.period_min,
                inclination_deg = EXCLUDED.inclination_deg,
                eccentricity    = EXCLUDED.eccentricity,
                updated_at      = NOW()
        """

        async for msg in consumer:
            try:
                data = json.loads(msg.value.decode('utf-8'))

                if msg.topic == "rf_raw":
                    await _handle_rf_raw(data, db.pool)
                    continue

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

                # --- Satellite TLE Upsert (orbital_raw messages only) ---
                tle_line1 = classification.get("tle_line1")
                tle_line2 = classification.get("tle_line2")
                if tle_line1 and tle_line2:
                    norad_id = classification.get("norad_id") or uid
                    sat_name = classification.get("name") or callsign
                    category = classification.get("category")
                    constellation = classification.get("constellation")
                    period_min = classification.get("period_min")
                    inclination_deg = classification.get("inclination_deg")
                    eccentricity = classification.get("eccentricity")
                    if db.pool:
                        try:
                            async with db.pool.acquire() as conn:
                                await conn.execute(
                                    satellite_upsert_sql,
                                    str(norad_id), sat_name, category, constellation,
                                    tle_line1, tle_line2,
                                    float(period_min) if period_min is not None else None,
                                    float(inclination_deg) if inclination_deg is not None else None,
                                    float(eccentricity) if eccentricity is not None else None,
                                )
                        except Exception as sat_err:
                            logger.error(f"Historian satellite upsert error: {sat_err}")

                # --- Batch Flush Logic ---
                now = time.time()
                if len(batch) >= BATCH_SIZE or (now - last_flush > FLUSH_INTERVAL and batch):
                    if db.pool:
                        try:
                            async with db.pool.acquire() as conn:
                                await conn.executemany(insert_sql, batch)
                            # BUG-009 / BUG-012: Only reset batch after a confirmed
                            # successful write. If the write fails the batch is kept
                            # so it will be retried on the next flush cycle.
                            batch = []
                            last_flush = now
                        except Exception as db_err:
                            logger.error(f"Historian DB Error: {db_err}")
                            # Do NOT clear batch — retry on next cycle.
                    else:
                        # BUG-009: Pool not ready yet; retain the batch rather than
                        # silently discarding it. Cap growth to avoid unbounded memory.
                        logger.warning(
                            f"Historian: DB pool not ready, retaining {len(batch)} records "
                            "(will retry on next flush cycle)"
                        )
                        if len(batch) > BATCH_SIZE * 10:
                            logger.error(
                                f"Historian: batch overflow ({len(batch)} records). "
                                "Dropping oldest entries to prevent OOM."
                            )
                            batch = batch[-BATCH_SIZE:]

            except Exception as e:
                logger.error(f"Historian message processing error: {e}")
                continue

    except asyncio.CancelledError:
        logger.info("Historian task cancelled")
    except Exception as e:
        logger.error(f"Historian Fatal Error: {e}")
    finally:
        # BUG-002: Flush any records still in the batch before the consumer stops.
        # Previously these were silently dropped on shutdown.
        if batch and db.pool:
            try:
                async with db.pool.acquire() as conn:
                    await conn.executemany(insert_sql, batch)
                logger.info(f"Historian: flushed {len(batch)} records on shutdown")
            except Exception as e:
                logger.error(f"Historian shutdown flush error: {e}")
        await consumer.stop()
        logger.info("Historian consumer stopped")


async def _handle_rf_raw(record: dict, pool):
    """Upsert an RF site from rf_raw Kafka message into rf_sites table."""
    if not pool:
        return

    geom_wkt = f"SRID=4326;POINT({record['lon']} {record['lat']})"

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO rf_sites (
                source, site_id, service, callsign, name,
                lat, lon, output_freq, input_freq, tone_ctcss, tone_dcs,
                modes, use_access, status, city, state, country,
                emcomm_flags, meta, geom, fetched_at, updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                ST_GeomFromEWKT($20), NOW(), NOW()
            )
            ON CONFLICT (source, site_id) DO UPDATE SET
                name         = EXCLUDED.name,
                lat          = EXCLUDED.lat,
                lon          = EXCLUDED.lon,
                output_freq  = EXCLUDED.output_freq,
                input_freq   = EXCLUDED.input_freq,
                tone_ctcss   = EXCLUDED.tone_ctcss,
                tone_dcs     = EXCLUDED.tone_dcs,
                modes        = EXCLUDED.modes,
                use_access   = EXCLUDED.use_access,
                status       = EXCLUDED.status,
                city         = EXCLUDED.city,
                state        = EXCLUDED.state,
                emcomm_flags = EXCLUDED.emcomm_flags,
                meta         = EXCLUDED.meta,
                geom         = EXCLUDED.geom,
                fetched_at   = NOW(),
                updated_at   = NOW()
        """,
            record["source"], record["site_id"], record["service"],
            record.get("callsign"), record.get("name"),
            record["lat"], record["lon"],
            record.get("output_freq"), record.get("input_freq"),
            record.get("tone_ctcss"), record.get("tone_dcs"),
            record.get("modes", []), record.get("use_access", "OPEN"),
            record.get("status", "Unknown"),
            record.get("city"), record.get("state"),
            record.get("country", "US"),
            record.get("emcomm_flags", []),
            json.dumps(record.get("meta", {})),
            geom_wkt,
        )
