import json
import logging
from datetime import datetime, timezone  # noqa: F401

from core.database import db
from fastapi import APIRouter, HTTPException
from services.system_metrics import system_metrics

router = APIRouter()
logger = logging.getLogger("SovereignWatch.Metrics")

# ─── /api/metrics/system ────────────────────────────────────────────────────

@router.get("/api/metrics/system")
async def get_system_metrics():
    """Return the background snapshot; only cold startup awaits a fresh sample."""
    if not db.redis_client:
        raise HTTPException(status_code=503, detail="Redis not ready")
    return await system_metrics.collect()


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
