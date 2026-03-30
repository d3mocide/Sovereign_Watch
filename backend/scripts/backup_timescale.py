#!/usr/bin/env python3
"""
TimescaleDB Incremental Backup Script
──────────────────────────────────────
Creates a compressed pg_dump of the sovereign_watch database and rotates
old backups, keeping the N most recent files (default: 7).

After each run the result is written to Redis under the key ``backup:last_run``
so that the Operations dashboard can surface backup health at a glance.

Usage
─────
    python backup_timescale.py [--keep N] [--backup-dir PATH]

Environment variables
─────────────────────
    DB_HOST          TimescaleDB host     (default: localhost)
    DB_PORT          TimescaleDB port     (default: 5432)
    POSTGRES_DB      Database name        (default: sovereign_watch)
    POSTGRES_USER    Database user        (default: postgres)
    POSTGRES_PASSWORD  ← required
    BACKUP_DIR       Output directory     (default: /backups)
    REDIS_HOST       Redis host           (default: localhost)
    REDIS_PORT       Redis port           (default: 6379)
    REDIS_PASSWORD   Redis password       (optional)

Docker Compose one-shot
───────────────────────
    docker compose run --rm sovereign-backend \
        python /app/scripts/backup_timescale.py --keep 7

Cron example (daily at 03:00)
──────────────────────────────
    0 3 * * * docker compose -f /opt/sovereign_watch/docker-compose.yml \
        run --rm sovereign-backend \
        python /app/scripts/backup_timescale.py --keep 7
"""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import redis


# ── Configuration ──────────────────────────────────────────────────────────

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "sovereign_watch")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/backups"))

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

BACKUP_STATUS_KEY = "backup:last_run"


# ── Helpers ─────────────────────────────────────────────────────────────────

def _redis_client() -> redis.Redis | None:
    """Return a connected sync Redis client, or None if unavailable."""
    try:
        r = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True,
            socket_connect_timeout=3,
        )
        r.ping()
        return r
    except Exception as exc:
        print(f"⚠️  Redis unavailable — backup status will not be recorded: {exc}")
        return None


def _write_status(r: redis.Redis | None, payload: dict) -> None:
    """Persist backup result to Redis (best-effort)."""
    if r is None:
        return
    try:
        r.set(BACKUP_STATUS_KEY, json.dumps(payload))
        print(f"✅ Backup status written to Redis key '{BACKUP_STATUS_KEY}'")
    except Exception as exc:
        print(f"⚠️  Failed to write backup status to Redis: {exc}")


def _rotate(backup_dir: Path, keep: int) -> None:
    """Delete the oldest .dump files if more than *keep* exist."""
    dumps = sorted(backup_dir.glob("sovereign_watch_*.dump"))
    to_remove = dumps[: max(0, len(dumps) - keep)]
    for f in to_remove:
        try:
            f.unlink()
            print(f"🗑️  Rotated old backup: {f.name}")
        except Exception as exc:
            print(f"⚠️  Could not remove {f.name}: {exc}")


# ── Main ────────────────────────────────────────────────────────────────────

def run_backup(keep: int = 7) -> None:
    if not DB_PASSWORD:
        print("❌ Error: POSTGRES_PASSWORD environment variable is not set.")
        sys.exit(1)

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    filename = f"sovereign_watch_{stamp}.dump"
    dest = BACKUP_DIR / filename

    r = _redis_client()
    started_at = datetime.now(tz=timezone.utc)

    print(f"📦 Starting backup → {dest}")

    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD

    cmd = [
        "pg_dump",
        "--host", DB_HOST,
        "--port", DB_PORT,
        "--username", DB_USER,
        "--dbname", DB_NAME,
        "--format", "custom",
        "--compress", "9",
        "--file", str(dest),
    ]

    try:
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=3600,  # 1-hour hard cap
        )
        elapsed = (datetime.now(tz=timezone.utc) - started_at).total_seconds()

        if result.returncode != 0:
            error_msg = result.stderr.strip() or "pg_dump exited non-zero"
            print(f"❌ pg_dump failed (exit {result.returncode}): {error_msg}")
            _write_status(r, {
                "ts": started_at.isoformat(),
                "status": "error",
                "error": error_msg,
                "file": filename,
                "size_bytes": 0,
                "duration_s": round(elapsed, 1),
            })
            sys.exit(1)

        size_bytes = dest.stat().st_size
        size_mb = round(size_bytes / 1024**2, 1)
        print(f"✅ Backup complete: {filename} ({size_mb} MB in {elapsed:.1f}s)")

        # Rotate old backups
        _rotate(BACKUP_DIR, keep)

        _write_status(r, {
            "ts": started_at.isoformat(),
            "status": "success",
            "file": filename,
            "size_bytes": size_bytes,
            "duration_s": round(elapsed, 1),
            "error": None,
        })

    except subprocess.TimeoutExpired:
        elapsed = (datetime.now(tz=timezone.utc) - started_at).total_seconds()
        msg = "pg_dump timed out after 3600 s"
        print(f"❌ {msg}")
        _write_status(r, {
            "ts": started_at.isoformat(),
            "status": "error",
            "error": msg,
            "file": filename,
            "size_bytes": 0,
            "duration_s": round(elapsed, 1),
        })
        sys.exit(1)
    except FileNotFoundError:
        print("❌ pg_dump not found — ensure postgresql-client is installed.")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backup TimescaleDB with rotation")
    parser.add_argument(
        "--keep",
        type=int,
        default=7,
        help="Number of most-recent backups to retain (default: 7)",
    )
    parser.add_argument(
        "--backup-dir",
        type=str,
        default=None,
        help="Override BACKUP_DIR environment variable",
    )
    args = parser.parse_args()

    if args.backup_dir:
        global BACKUP_DIR  # noqa: PLW0603
        BACKUP_DIR = Path(args.backup_dir)

    run_backup(keep=args.keep)
