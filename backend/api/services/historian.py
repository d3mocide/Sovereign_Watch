import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer
from core.config import settings
from core.database import db

logger = logging.getLogger("SovereignWatch.Historian")


async def rf_sites_cleanup_task():
    """
    Periodically prune rf_sites rows that haven't been refreshed in 30 days.
    Decommissioned repeaters and removed FCC registrations naturally stop receiving
    upserts; this task evicts them so the table doesn't grow unbounded.
    Runs once at startup (after a short delay) then every 24 hours.
    """
    logger.info(
        "RF sites cleanup task started (24-hour interval, 30-day staleness threshold)"
    )
    await asyncio.sleep(300)  # wait 5 min for DB pool to be fully ready
    while True:
        if db.pool:
            try:
                async with db.pool.acquire() as conn:
                    deleted = await conn.fetchval("SELECT prune_stale_rf_sites()")
                if deleted:
                    logger.info("RF sites cleanup: pruned %d stale site(s)", deleted)
                else:
                    logger.debug("RF sites cleanup: no stale sites found")
            except Exception as err:
                logger.error("RF sites cleanup error: %s", err)
        await asyncio.sleep(86400)  # 24 hours


async def historian_task():
    """
    Background task to consume Kafka messages and persist them to TimescaleDB.
    Runs independently of the WebSocket consumers.

    orbital_raw messages are still consumed so the `satellites` TLE catalogue
    is kept current, but satellite *positions* are no longer written to a
    separate hypertable.  Positions are deterministic and are computed on-demand
    via SGP4 from the stored TLE whenever a history or search request arrives.
    """
    logger.info("Historian task started")
    consumer = AIOKafkaConsumer(
        "adsb_raw",
        "ais_raw",
        "orbital_raw",
        "rf_raw",
        "satnogs_transmitters",
        "satnogs_observations",
        "gdelt_raw",
        bootstrap_servers=settings.KAFKA_BROKERS,
        group_id="historian-writer-v2",
        auto_offset_reset="earliest",
    )

    try:
        await consumer.start()

        batch = []
        last_flush = time.time()
        BATCH_SIZE = 100
        FLUSH_INTERVAL = 2.0

        # In-memory cache of TLE hashes: norad_id → sha1(tle_line1 + tle_line2).
        # TLEs are fetched every 6 hours but the propagation loop emits ~2 000 msgs/sec
        # of identical orbital data — without dedup, that's ~2 000 redundant upserts/sec.
        # This cache eliminates them; it resets on historian restart (safe — worst case
        # one extra upsert per NORAD ID on startup).
        _tle_hash_cache: dict[str, str] = {}

        # RF sites are batched separately to avoid per-message round trips.
        # Keyed by (source, site_id) so duplicates within a flush window are
        # collapsed to the latest record — same dedup the DB ON CONFLICT gives us
        # but without the extra write.
        rf_batch: dict[tuple, dict] = {}
        rf_last_flush = time.time()

        # PostGIS Geometry Insert: ST_SetSRID(ST_MakePoint(lon, lat), 4326)
        insert_sql = """
            INSERT INTO tracks (time, entity_id, type, lat, lon, alt, speed, heading, meta, geom)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_SetSRID(ST_MakePoint($5, $4), 4326))
        """

        rf_upsert_sql = """
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

        satnogs_tx_upsert_sql = """
            INSERT INTO satnogs_transmitters (
                uuid, norad_id, sat_name, description, alive, type,
                uplink_low, uplink_high, downlink_low, downlink_high,
                mode, invert, baud, status, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
            ON CONFLICT (uuid) DO UPDATE SET
                norad_id      = EXCLUDED.norad_id,
                sat_name      = EXCLUDED.sat_name,
                description   = EXCLUDED.description,
                alive         = EXCLUDED.alive,
                type          = EXCLUDED.type,
                uplink_low    = EXCLUDED.uplink_low,
                uplink_high   = EXCLUDED.uplink_high,
                downlink_low  = EXCLUDED.downlink_low,
                downlink_high = EXCLUDED.downlink_high,
                mode          = EXCLUDED.mode,
                invert        = EXCLUDED.invert,
                baud          = EXCLUDED.baud,
                status        = EXCLUDED.status,
                updated_at    = NOW()
        """

        satnogs_obs_insert_sql = """
            INSERT INTO satnogs_observations (
                time, observation_id, norad_id, ground_station_id, transmitter_uuid,
                frequency, mode, status, rise_azimuth, set_azimuth, max_altitude,
                has_audio, has_waterfall, vetted_status, tle0, tle1, tle2, fetched_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
            ON CONFLICT (observation_id, time) DO NOTHING
        """

        gdelt_upsert_sql = """
            INSERT INTO gdelt_events (
                time, event_id, actor1, actor2, headline, url, goldstein, tone, lat, lon, geom,
                actor1_country, actor2_country, event_code, event_root_code,
                quad_class, num_mentions, num_sources, num_articles, event_date
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                ST_SetSRID(ST_MakePoint($10, $9), 4326),
                $11, $12, $13, $14, $15, $16, $17, $18,
                CASE WHEN ($19::text) IS NOT NULL AND length(($19::text)) = 8
                     THEN to_date(($19::text), 'YYYYMMDD') ELSE NULL END
            )
            ON CONFLICT (event_id, time) DO NOTHING
        """

        # Batch buffers for satnogs transmitters (keyed by uuid for dedup)
        satnogs_tx_batch: dict[str, dict] = {}
        satnogs_tx_last_flush = time.time()

        async for msg in consumer:
            try:
                data = json.loads(msg.value.decode("utf-8"))

                if msg.topic == "rf_raw":
                    key = (data.get("source", ""), data.get("site_id", ""))
                    rf_batch[key] = data
                    now = time.time()
                    if len(rf_batch) >= BATCH_SIZE or (
                        now - rf_last_flush > FLUSH_INTERVAL and rf_batch
                    ):
                        if db.pool:
                            try:
                                rows = [
                                    (
                                        r["source"],
                                        r["site_id"],
                                        r["service"],
                                        r.get("callsign"),
                                        r.get("name"),
                                        r["lat"],
                                        r["lon"],
                                        r.get("output_freq"),
                                        r.get("input_freq"),
                                        r.get("tone_ctcss"),
                                        r.get("tone_dcs"),
                                        r.get("modes", []),
                                        r.get("use_access", "OPEN"),
                                        r.get("status", "Unknown"),
                                        r.get("city"),
                                        r.get("state"),
                                        r.get("country", "US"),
                                        r.get("emcomm_flags", []),
                                        json.dumps(r.get("meta", {})),
                                        f"SRID=4326;POINT({r['lon']} {r['lat']})",
                                    )
                                    for r in rf_batch.values()
                                ]
                                async with db.pool.acquire() as conn:
                                    await conn.executemany(rf_upsert_sql, rows)
                                rf_batch.clear()
                                rf_last_flush = now
                            except Exception as rf_err:
                                logger.error(
                                    "Historian RF batch flush error: %s", rf_err
                                )
                    continue

                if msg.topic == "satnogs_transmitters":
                    uuid = data.get("uuid")
                    if uuid:
                        satnogs_tx_batch[uuid] = data
                    now = time.time()
                    if len(satnogs_tx_batch) >= BATCH_SIZE or (
                        now - satnogs_tx_last_flush > FLUSH_INTERVAL
                        and satnogs_tx_batch
                    ):
                        if db.pool:
                            try:
                                rows = [
                                    (
                                        r["uuid"],
                                        r["norad_id"],
                                        r.get("sat_name"),
                                        r.get("description"),
                                        bool(r.get("alive", True)),
                                        r.get("type", "Transmitter"),
                                        r.get("uplink_low"),
                                        r.get("uplink_high"),
                                        r.get("downlink_low"),
                                        r.get("downlink_high"),
                                        r.get("mode"),
                                        bool(r.get("invert", False)),
                                        r.get("baud"),
                                        r.get("status", "active"),
                                    )
                                    for r in satnogs_tx_batch.values()
                                ]
                                async with db.pool.acquire() as conn:
                                    await conn.executemany(satnogs_tx_upsert_sql, rows)
                                satnogs_tx_batch.clear()
                                satnogs_tx_last_flush = now
                            except Exception as stx_err:
                                logger.error(
                                    "Historian SatNOGS transmitter flush error: %s",
                                    stx_err,
                                )
                    continue

                if msg.topic == "satnogs_observations":
                    if db.pool:
                        try:
                            start_str = data.get("start")
                            if start_str:
                                obs_time = datetime.fromisoformat(
                                    start_str.replace("Z", "+00:00")
                                )
                            else:
                                obs_time = datetime.now(timezone.utc)
                            obs_row = (
                                obs_time,
                                data.get("observation_id"),
                                data.get("norad_id"),
                                data.get("ground_station_id"),
                                data.get("transmitter_uuid"),
                                data.get("frequency"),
                                data.get("mode"),
                                data.get("status", "good"),
                                data.get("rise_azimuth"),
                                data.get("set_azimuth"),
                                data.get("max_altitude"),
                                bool(data.get("has_audio", False)),
                                bool(data.get("has_waterfall", False)),
                                data.get("vetted_status"),
                                data.get("tle0"),
                                data.get("tle1"),
                                data.get("tle2"),
                            )
                            async with db.pool.acquire() as conn:
                                await conn.execute(satnogs_obs_insert_sql, *obs_row)
                        except Exception as sobs_err:
                            logger.error(
                                "Historian SatNOGS observation insert error: %s",
                                sobs_err,
                            )
                    continue

                if msg.topic == "gdelt_raw":
                    if db.pool:
                        try:
                            # GDelt events are unique by (event_id, time).
                            # We timestamp them by ingestion time or original time.
                            ts_ms = data.get("time")
                            event_time = datetime.fromtimestamp(
                                ts_ms / 1000.0, tz=timezone.utc
                            )
                            row = (
                                event_time,
                                data.get("event_id"),
                                data.get("actor1") or data.get("headline"),
                                data.get("actor2"),
                                data.get("headline"),
                                data.get("url"),
                                data.get("goldstein"),
                                data.get("tone"),
                                data.get("lat"),
                                data.get("lon"),
                                data.get("actor1_country"),
                                data.get("actor2_country"),
                                data.get("event_code"),
                                data.get("event_root_code"),
                                data.get("quad_class"),
                                data.get("num_mentions"),
                                data.get("num_sources"),
                                data.get("num_articles"),
                                data.get("event_date"),
                            )
                            async with db.pool.acquire() as conn:
                                await conn.execute(gdelt_upsert_sql, *row)
                        except Exception as gdelt_err:
                            logger.error(
                                "Historian GDELT event insert error: %s", gdelt_err
                            )
                    continue

                # --- Parsing Logic ---

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

                contact = detail.get("contact", {})
                callsign = contact.get("callsign") or uid
                classification = detail.get("classification", {})

                if msg.topic == "orbital_raw":
                    # Satellite positions are NOT stored in a position hypertable.
                    # They are fully reproducible on-demand via SGP4 from the TLE
                    # in the `satellites` table — storing 2 000 rows/sec of
                    # deterministic data would waste I/O and storage for no benefit.
                    # We still upsert the TLE so pass-prediction and groundtrack
                    # endpoints always have current orbital parameters.
                    tle_line1 = classification.get("tle_line1")
                    tle_line2 = classification.get("tle_line2")
                    if tle_line1 and tle_line2 and db.pool:
                        norad_id = str(classification.get("norad_id") or uid)
                        tle_hash = hashlib.sha1(
                            (tle_line1 + tle_line2).encode(), usedforsecurity=False
                        ).hexdigest()
                        if _tle_hash_cache.get(norad_id) == tle_hash:
                            continue  # TLE unchanged — skip redundant DB write
                        try:
                            sat_name = classification.get("name") or callsign
                            category = classification.get("category")
                            constellation = classification.get("constellation")
                            period_min = classification.get("period_min")
                            incl_deg = classification.get("inclination_deg")
                            eccentricity = classification.get("eccentricity")
                            async with db.pool.acquire() as conn:
                                await conn.execute(
                                    satellite_upsert_sql,
                                    norad_id,
                                    sat_name,
                                    category,
                                    constellation,
                                    tle_line1,
                                    tle_line2,
                                    float(period_min)
                                    if period_min is not None
                                    else None,
                                    float(incl_deg) if incl_deg is not None else None,
                                    float(eccentricity)
                                    if eccentricity is not None
                                    else None,
                                )
                            _tle_hash_cache[norad_id] = tle_hash
                        except Exception as sat_err:
                            logger.error(f"Historian satellite upsert error: {sat_err}")
                    continue  # orbital_raw never goes into the tracks batch

                # ADS-B and AIS rows → tracks hypertable
                meta = json.dumps(
                    {
                        "callsign": callsign,
                        "how": data.get("how"),
                        "ce": point.get("ce"),
                        "le": point.get("le"),
                        "classification": classification,
                    }
                )
                batch.append((ts, uid, etype, lat, lon, alt, speed, heading, meta))

                # --- Batch Flush Logic ---
                now = time.time()
                flush_needed = len(batch) >= BATCH_SIZE or (
                    now - last_flush > FLUSH_INTERVAL and batch
                )
                if flush_needed:
                    if db.pool:
                        try:
                            async with db.pool.acquire() as conn:
                                await conn.executemany(insert_sql, batch)
                            # BUG-009 / BUG-012: Only reset batch after confirmed write.
                            batch = []
                            last_flush = now
                        except Exception as db_err:
                            logger.error(f"Historian DB Error: {db_err}")
                            # Do NOT clear batch — retry on next cycle.
                    else:
                        # BUG-009: Pool not ready; retain records rather than dropping.
                        logger.warning(
                            f"Historian: DB pool not ready, retaining {len(batch)} records "
                            "(will retry on next flush cycle)"
                        )
                        if len(batch) > BATCH_SIZE * 10:
                            logger.error(
                                f"Historian: tracks batch overflow ({len(batch)} records). "
                                "Dropping oldest entries to prevent OOM."
                            )
                            batch = batch[-BATCH_SIZE:]

            except Exception as e:
                logger.error(f"Historian message processing error: {e}")
                continue

    except asyncio.CancelledError:
        logger.info("Historian task cancelled")
        raise  # Allow the supervisor / lifespan to observe the cancellation
    except Exception as e:
        logger.error(f"Historian Fatal Error: {e}")
        raise  # Re-raise so the supervisor knows the task crashed
    finally:
        # BUG-002: Flush any records still in the batch before the consumer stops.
        if batch and db.pool:
            try:
                async with db.pool.acquire() as conn:
                    await conn.executemany(insert_sql, batch)
                logger.info(
                    f"Historian: flushed {len(batch)} track records on shutdown"
                )
            except Exception as e:
                logger.error(f"Historian shutdown flush error: {e}")
        if rf_batch and db.pool:
            try:
                rows = [
                    (
                        r["source"],
                        r["site_id"],
                        r["service"],
                        r.get("callsign"),
                        r.get("name"),
                        r["lat"],
                        r["lon"],
                        r.get("output_freq"),
                        r.get("input_freq"),
                        r.get("tone_ctcss"),
                        r.get("tone_dcs"),
                        r.get("modes", []),
                        r.get("use_access", "OPEN"),
                        r.get("status", "Unknown"),
                        r.get("city"),
                        r.get("state"),
                        r.get("country", "US"),
                        r.get("emcomm_flags", []),
                        json.dumps(r.get("meta", {})),
                        f"SRID=4326;POINT({r['lon']} {r['lat']})",
                    )
                    for r in rf_batch.values()
                ]
                async with db.pool.acquire() as conn:
                    await conn.executemany(rf_upsert_sql, rows)
                logger.info(
                    "Historian: flushed %d RF site records on shutdown", len(rows)
                )
            except Exception as e:
                logger.error("Historian RF shutdown flush error: %s", e)
        if satnogs_tx_batch and db.pool:
            try:
                rows = [
                    (
                        r["uuid"],
                        r["norad_id"],
                        r.get("sat_name"),
                        r.get("description"),
                        bool(r.get("alive", True)),
                        r.get("type", "Transmitter"),
                        r.get("uplink_low"),
                        r.get("uplink_high"),
                        r.get("downlink_low"),
                        r.get("downlink_high"),
                        r.get("mode"),
                        bool(r.get("invert", False)),
                        r.get("baud"),
                        r.get("status", "active"),
                    )
                    for r in satnogs_tx_batch.values()
                ]
                async with db.pool.acquire() as conn:
                    await conn.executemany(satnogs_tx_upsert_sql, rows)
                logger.info(
                    "Historian: flushed %d SatNOGS transmitter records on shutdown",
                    len(rows),
                )
            except Exception as e:
                logger.error(
                    "Historian SatNOGS transmitter shutdown flush error: %s", e
                )
        await consumer.stop()
        logger.info("Historian consumer stopped")
