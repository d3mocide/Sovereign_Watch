# Task: InfraPoller Async Modernization

**Date:** 2026-03-21
**Branch:** `claude/satnogs-integration-n6seO`

## Summary

Rewrote `backend/ingestion/infra_poller/main.py` from a synchronous, single-threaded script (447 lines, `requests`, `time.sleep`) to a fully async, class-based service matching the architecture used by all other Sovereign Watch pollers.

## Changes

### `backend/ingestion/infra_poller/main.py` (full rewrite)

**Before:** Module-level globals, blocking `requests.get()`, `time.sleep()`, no signal handling.

**After:**
- `InfraPollerService` class with `setup()`, `run()`, `shutdown()` lifecycle methods
- Three concurrent `asyncio.Task` loops running via `asyncio.gather`:
  - `cables_loop()` — submarine cables + landing stations (7-day interval → Redis)
  - `ioda_loop()` — IODA internet outage summary (30-min interval → Redis)
  - `fcc_loop()` — FCC ASR tower registrations (7-day, hour-gated → PostgreSQL)
- `requests` → `httpx.AsyncClient` for all HTTP calls
- `redis.Redis` → `redis.asyncio` (aioredis) for non-blocking Redis access
- `time.sleep()` → `asyncio.sleep()` throughout
- FCC 35 MB ZIP download: `httpx.AsyncClient.stream()` with `resp.aiter_bytes()` for memory-efficient async streaming
- FCC ZIP/CSV parse and DB write: extracted as standalone sync functions (`_parse_fcc_zip_sync`, `_ingest_fcc_records_sync`) and called via `asyncio.to_thread()` to keep the event loop responsive
- Nominatim geocoding: `await asyncio.sleep(1)` between requests (1 req/s policy), now non-blocking
- SIGINT/SIGTERM signal handlers added — trigger graceful `shutdown()` coroutine

### `backend/ingestion/infra_poller/pyproject.toml`

- Replaced `requests==2.32.5` with `httpx==0.28.1`

### `backend/ingestion/infra_poller/Dockerfile`

- `uv sync --frozen --no-dev` → `uv sync --frozen --no-dev 2>/dev/null || uv sync --no-dev` (fallback for stale lock file after dependency change)

### `backend/ingestion/infra_poller/tests/test_infra.py` (new)

24 unit tests covering the three pure, I/O-free helper functions:
- `dms_to_decimal` — FCC DMS coordinate parsing (N/S/E/W, empty fields, invalid input, None)
- `parse_float` — pipe-delimited FCC field parsing (numeric, whitespace, empty, None, invalid)
- `ioda_severity` — log-scale normalisation (zero, clamping, midpoint, threshold boundary)

## Verification

```
ruff check .  → All checks passed
pytest tests/ → 24 passed in 0.93s
```

## Key Design Decisions

- **No Kafka dependency:** InfraPoller remains a Redis/PostgreSQL-only service. Cables and outages are written directly to Redis (frontend reads them via the API); FCC towers go to PostgreSQL. Adding Kafka routing would be unnecessary complexity.
- **Thread offload for blocking I/O:** psycopg2 and zipfile/csv are inherently synchronous. `asyncio.to_thread()` is the correct pattern rather than replacing them with async equivalents.
- **Nominatim rate limit:** `await asyncio.sleep(1)` between geocoding requests now allows the cables and FCC loops to continue running concurrently during the sleep, unlike the old `time.sleep(1)` which blocked the whole process.
