import json
import logging
from datetime import datetime, timezone  # noqa: F401

import psutil
from aiokafka import AIOKafkaConsumer
from aiokafka.admin import AIOKafkaAdminClient
from core.config import settings
from core.database import db
from fastapi import APIRouter, HTTPException

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Metrics")

# ─── /api/metrics/system ────────────────────────────────────────────────────

SYSTEM_CACHE_KEY = "metrics:system:snapshot"
SYSTEM_CACHE_TTL = 5  # seconds


@router.get("/api/metrics/system")
async def get_system_metrics():
    """
    Host system metrics (CPU, memory, disk, I/O, temperatures) combined with
    Redis health stats and Kafka consumer-group lag for ``historian-writer-v2``.

    Result is cached in Redis for 5 s to avoid hammering psutil on every poll.
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    # Return cached snapshot when fresh
    cached = await db.redis_client.get(SYSTEM_CACHE_KEY)
    if cached:
        return json.loads(cached)

    payload: dict = {}

    # --- psutil: CPU ---
    try:
        payload["cpu_percent"] = psutil.cpu_percent(interval=0.2)
        payload["cpu_per_core"] = psutil.cpu_percent(percpu=True, interval=0)
    except Exception as exc:
        logger.warning("psutil CPU error: %s", exc)
        payload["cpu_percent"] = None
        payload["cpu_per_core"] = []

    # --- psutil: Memory ---
    try:
        vm = psutil.virtual_memory()
        payload["memory"] = {
            "total_gb": round(vm.total / 1024**3, 1),
            "used_gb": round(vm.used / 1024**3, 1),
            "percent": vm.percent,
        }
    except Exception as exc:
        logger.warning("psutil memory error: %s", exc)
        payload["memory"] = None

    # --- psutil: Disk ---
    try:
        du = psutil.disk_usage("/")
        payload["disk"] = {
            "total_gb": round(du.total / 1024**3, 1),
            "used_gb": round(du.used / 1024**3, 1),
            "percent": du.percent,
        }
    except Exception as exc:
        logger.warning("psutil disk error: %s", exc)
        payload["disk"] = None

    # --- psutil: Disk I/O ---
    try:
        dio = psutil.disk_io_counters()
        if dio:
            payload["disk_io"] = {
                "read_mb": round(dio.read_bytes / 1024**2, 1),
                "write_mb": round(dio.write_bytes / 1024**2, 1),
            }
        else:
            payload["disk_io"] = None
    except Exception as exc:
        logger.warning("psutil disk_io error: %s", exc)
        payload["disk_io"] = None

    # --- psutil: Network I/O ---
    try:
        nio = psutil.net_io_counters()
        payload["net_io"] = {
            "sent_mb": round(nio.bytes_sent / 1024**2, 1),
            "recv_mb": round(nio.bytes_recv / 1024**2, 1),
        }
    except Exception as exc:
        logger.warning("psutil net_io error: %s", exc)
        payload["net_io"] = None

    # --- psutil: Temperatures ---
    try:
        temps_raw = psutil.sensors_temperatures()
        if temps_raw:
            payload["temperatures"] = {
                sensor: [round(r.current, 1) for r in readings]
                for sensor, readings in temps_raw.items()
            }
        else:
            payload["temperatures"] = None
    except (AttributeError, Exception):
        payload["temperatures"] = None

    # --- Redis health ---
    try:
        info = await db.redis_client.info()
        hits = info.get("keyspace_hits", 0)
        misses = info.get("keyspace_misses", 0)
        total_ops = hits + misses
        hit_rate = round((hits / total_ops) * 100, 1) if total_ops > 0 else 0.0
        payload["redis"] = {
            "used_memory_mb": round(info.get("used_memory", 0) / 1024**2, 1),
            "connected_clients": info.get("connected_clients", 0),
            "hit_rate_pct": hit_rate,
            "evicted_keys": info.get("evicted_keys", 0),
        }
    except Exception as exc:
        logger.warning("Redis INFO error: %s", exc)
        payload["redis"] = None

    # --- Kafka consumer-group lag ---
    payload["kafka_lag"] = await _get_kafka_lag()

    # Cache and return
    try:
        await db.redis_client.setex(
            SYSTEM_CACHE_KEY, SYSTEM_CACHE_TTL, json.dumps(payload)
        )
    except Exception:
        pass

    return payload


async def _get_kafka_lag() -> dict | None:
    """
    Fetch consumer-group lag for ``historian-writer-v2``.

    Uses AIOKafkaAdminClient to read committed offsets, then a short-lived
    AIOKafkaConsumer to fetch end (high-watermark) offsets per partition.
    Both clients are torn down before returning.  Any failure returns None
    so the rest of the metrics response is unaffected.
    """
    GROUP_ID = "historian-writer-v2"
    LAG_AMBER = 500
    LAG_RED = 5_000

    admin: AIOKafkaAdminClient | None = None
    consumer: AIOKafkaConsumer | None = None
    try:
        admin = AIOKafkaAdminClient(bootstrap_servers=settings.KAFKA_BROKERS)
        await admin.start()

        # committed offsets: {TopicPartition: OffsetAndMetadata}
        committed = await admin.list_consumer_group_offsets(GROUP_ID)
        if not committed:
            return {GROUP_ID: {"total_lag": 0, "severity": "ok", "topics": {}}}

        tps = list(committed.keys())

        # End (high-watermark) offsets via a transient consumer
        consumer = AIOKafkaConsumer(
            bootstrap_servers=settings.KAFKA_BROKERS,
            enable_auto_commit=False,
        )
        await consumer.start()
        end_offsets: dict = await consumer.end_offsets(tps)

        topics: dict[str, int] = {}
        for tp, meta in committed.items():
            c_offset = meta.offset if meta is not None else 0
            e_offset = end_offsets.get(tp, c_offset)
            lag = max(0, e_offset - c_offset)
            topics[tp.topic] = topics.get(tp.topic, 0) + lag

        total_lag = sum(topics.values())
        severity = (
            "ok"
            if total_lag < LAG_AMBER
            else ("amber" if total_lag < LAG_RED else "red")
        )
        return {
            GROUP_ID: {"total_lag": total_lag, "severity": severity, "topics": topics}
        }

    except Exception as exc:
        logger.warning("Kafka lag fetch error: %s", exc)
        return None
    finally:
        if consumer:
            try:
                await consumer.stop()
            except Exception:
                pass
        if admin:
            try:
                await admin.close()
            except Exception:
                pass


# ─── /api/logs/recent ───────────────────────────────────────────────────────


@router.get("/api/logs/recent")
async def get_recent_logs(limit: int = 100, level: str | None = None):
    """
    Return the most recent structured log entries from the ``logs:recent``
    Redis list (populated by RedisLogHandler).  Newest entries first.

    Query params:
    - ``limit``: max entries to return (1–500, default 100)
    - ``level``: optional filter — INFO, WARNING, ERROR, CRITICAL
    """
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")

    limit = max(1, min(limit, 500))

    try:
        raw = await db.redis_client.lrange("logs:recent", 0, limit - 1)
    except Exception as exc:
        logger.error("Failed to fetch logs from Redis: %s", exc)
        raise HTTPException(status_code=500, detail="Internal server error")

    filter_level = level.upper().replace("WARN", "WARNING") if level else None

    logs = []
    for entry in raw:
        try:
            parsed = json.loads(entry)
            if filter_level and parsed.get("level", "").upper() != filter_level:
                continue
            logs.append(parsed)
        except (json.JSONDecodeError, Exception):
            continue

    return {"status": "ok", "logs": logs}


# ─── /api/metrics/backup-status ─────────────────────────────────────────────


@router.get("/api/metrics/backup-status")
async def get_backup_status():
    """
    Return TimescaleDB chunk/size stats and the most recent backup run
    metadata (written by ``backend/scripts/backup_timescale.py``).
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    # --- TimescaleDB stats ---
    db_stats: dict = {}
    try:
        async with db.pool.acquire() as conn:
            size_row = await conn.fetchrow(
                "SELECT pg_database_size(current_database()) AS size_bytes"
            )
            db_stats["db_size_mb"] = (
                round(size_row["size_bytes"] / 1024**2, 1) if size_row else None
            )

            chunk_row = await conn.fetchrow(
                "SELECT COUNT(*) AS cnt FROM timescaledb_information.chunks"
            )
            db_stats["chunk_count"] = chunk_row["cnt"] if chunk_row else None

            oldest_row = await conn.fetchrow("SELECT MIN(time) AS oldest FROM tracks")
            db_stats["oldest_chunk_time"] = (
                oldest_row["oldest"].isoformat()
                if oldest_row and oldest_row["oldest"]
                else None
            )

            db_stats["retention_hours"] = 72  # matches init.sql policy
    except Exception as exc:
        logger.error("Failed to query TimescaleDB stats: %s", exc)
        db_stats = {"error": str(exc)}

    # --- Backup metadata from Redis ---
    backup_info: dict | None = None
    if db.redis_client:
        try:
            raw = await db.redis_client.get("backup:last_run")
            if raw:
                backup_info = json.loads(raw)
        except Exception as exc:
            logger.warning("Failed to read backup status from Redis: %s", exc)

    return {"status": "ok", **db_stats, "backup": backup_info}
