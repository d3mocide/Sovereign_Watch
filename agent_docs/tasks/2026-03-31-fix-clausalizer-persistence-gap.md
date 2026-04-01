# 2026-03-31 - Fix Clausalizer Persistence Gap

## Issue
The TAK clausalizer service was running and emitting to Kafka topic `clausal_chains_state_changes`, but there was no active persistence path writing those state-change clauses into TimescaleDB table `clausal_chains`.

Impact:
- `/api/ai_router/evaluate` and related analysis endpoints queried `clausal_chains` but often saw empty TAK data.
- Operators had no explicit trigger and no clear feedback loop, making the feature appear non-functional.

## Solution
Added direct persistence in the clausalizer emitter so every emitted state-change clause is also inserted into `clausal_chains`.

## Changes
- Updated [backend/ingestion/tak_clausalizer/clause_emitter.py](backend/ingestion/tak_clausalizer/clause_emitter.py):
  - Added optional Timescale connection pool using `DB_DSN`.
  - Added `_persist_clause(...)` insert path into `clausal_chains`.
  - Retained Kafka emission to `clausal_chains_state_changes`.
  - Fixed timestamp binding by converting ISO strings to `datetime` for asyncpg.

- Updated [docker-compose.yml](docker-compose.yml):
  - Added `DB_DSN` env var to `sovereign-tak-clausalizer`.
  - Added `sovereign-timescaledb` health dependency to clausalizer startup.

## Verification
- Runtime/service check:
  - `docker compose ps sovereign-tak-clausalizer sovereign-adsb-poller sovereign-ais-poller sovereign-backend`
  - Result: all required services running.

- Targeted lint on changed file:
  - `cd backend/ingestion/tak_clausalizer && uv tool run ruff check clause_emitter.py`
  - Result: pass.

- Containerized runtime deploy (required for ingestion changes):
  - `docker compose up -d --build sovereign-tak-clausalizer`
  - Result: rebuilt and restarted.

- Data persistence validation:
  - Queried Timescale for last 5 minutes in `clausal_chains`.
  - Result observed:
    - `TAK_ADSB`: 315 rows
    - `TAK_AIS`: 27 rows

- Note on host tests:
  - `uv run python -m pytest` in this poller could not run on host due `asyncpg==0.30.0` wheel/build incompatibility with local CPython 3.14 runtime; containerized verification was used instead.

## Benefits
- Clausalizer output now reaches the same table AI Router/analyst features query.
- Removes the hidden pipeline gap that made the feature appear untriggerable/broken.
- Restores an end-to-end path from raw TAK telemetry to clausal-chain-backed analytics.
