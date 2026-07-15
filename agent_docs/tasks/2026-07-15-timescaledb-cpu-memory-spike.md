# TimescaleDB CPU / Memory / I/O Spike

## Issue

`docker stats` showed sovereign-timescaledb sustained at 100–300 % CPU,
~1 GB RSS, and rapidly growing block-I/O reads (~1 GB read between two stats
samples). Server logs showed three distinct problems:

1. Recurring query error every few minutes:
   `ERROR: operator does not exist: text = integer` on
   `SELECT ... FROM satellites WHERE norad_id = ANY($1::int[])` —
   `satellites.norad_id` is `TEXT`, but the AI Router's SatNOGS enrichment
   cast the parameter to `int[]`, so mission-scoped satellite TLE lookups
   failed on every call.
2. Checkpoint stats (`wrote 8173 buffers (49.9%)`) revealed the server was
   running stock Postgres defaults — 128 MB `shared_buffers`, 5-minute
   checkpoints — on an ~8 GB host. The `timescale/timescaledb-ha` image does
   **not** run `timescaledb-tune`, and the compose service passed no settings.
   Continuous hypertable ingest (tracks, clausal_chains) plus 30-second
   analytics polling (clusters, clausal-chains, risk overlays) thrashed the
   tiny buffer cache (constant disk re-reads → CPU) and forced ~100 MB of
   full-page-write WAL every 5 minutes.
3. `WARNING: poor compression ratio detected for chunk ... 0.75` on
   `iss_positions`: 1-hour chunks at the ISS poller's 5-second cadence hold
   only ~720 rows (~73 kB), so compression made chunks *bigger* and the
   compression job churned through micro-chunks every 30 minutes.

## Solution

- Fixed the type mismatch: compare `norad_id` as `text[]` and pass string
  parameters (matching what `orbital.py` already does).
- Added explicit Postgres tuning to the timescaledb service in
  `docker-compose.yml`: 512 MB shared_buffers / 1.5 GB effective_cache_size
  (both overridable via `PG_SHARED_BUFFERS` / `PG_EFFECTIVE_CACHE_SIZE`),
  16 MB work_mem, 128 MB maintenance_work_mem, 15-minute checkpoints,
  2 GB max_wal_size, WAL compression, and a cap of 8 TimescaleDB background
  workers.
- Migration `V006__iss_positions_daily_chunks.sql`: switch `iss_positions`
  to 1-day chunks and reschedule the compression policy to compress after
  1 day (job now runs every 12 h instead of every 30 min). Existing 1-hour
  chunks age out via the 7-day retention policy. `06_critical_infrastructure.sql`
  updated to match for fresh installs.

## Changes

- `backend/api/routers/ai_router.py` — `_fetch_aot_relevant_satnogs_events`:
  `ANY($1::int[])` → `ANY($1::text[])` with stringified NORAD IDs.
- `docker-compose.yml` — `sovereign-timescaledb.command` with tuned `-c`
  settings.
- `backend/db/migrations/V006__iss_positions_daily_chunks.sql` — new
  migration (`set_chunk_time_interval` + compression policy reschedule).
- `backend/db/initdb/06_critical_infrastructure.sql` — daily chunks +
  1-day compression lag for fresh deployments.
- `.env.example` — documented the optional `PG_SHARED_BUFFERS` /
  `PG_EFFECTIVE_CACHE_SIZE` overrides.

## Verification

- `cd backend/api && uv tool run ruff check .` — all checks passed.
- `cd backend/api && uv run python -m pytest` — 247 passed.
- `docker compose config` renders the timescaledb command with the tuning
  flags and default values.
- Note: the compose change requires `docker compose up -d sovereign-timescaledb`
  to recreate the container; V006 applies automatically on the next backend
  start (migrate.py).

## Benefits

- Mission-scoped orbital/SatNOGS AI enrichment works again instead of
  erroring on every call.
- Buffer cache sized to the working set: eliminates the GB-scale re-read
  churn and the associated CPU burn; checkpoints drop from every 5 minutes
  to every 15 with compressed WAL (fewer full-page writes, less write I/O).
- Compression job stops burning cycles producing negative-value compressed
  chunks for `iss_positions`.
