# Domain-Agent Heuristic Redesign + Clausalizer Dead-Code Removal

Follow-ups from `agent_docs/ai_research/2026-07-10-clausal-chain-pipeline-review.md`
(medium-priority findings #12 and the dead batch machinery).

## Issue

1. `/api/ai_router/analyze/sea` labelled any AIS entity with a single
   clausal-chain row in the window a "dark vessel". Clausal chains only
   record *state changes*, so steadily-cruising vessels legitimately emit few
   rows — the heuristic flagged normal traffic while the repo already had a
   real dark-vessel subsystem (FIRMS thermal × AIS cross-reference in
   `routers/firms.py`).
2. `/api/ai_router/analyze/air` labelled any aircraft with ≥5 clausal rows a
   "possible holding pattern" — any maneuvering aircraft qualifies — while
   the aviation poller already runs actual racetrack-turn detection published
   to Redis (`holding_pattern:active_zones`) and the `holding_pattern_events`
   hypertable.
3. `tak_clausalizer/service.py` carried dead batching machinery
   (`message_batch`, `flush_batch`, `batch_flush_loop`) that was never
   populated; docs claimed batch-window DB writes that never happened.

## Solution

Reuse the real detection subsystems in the domain agents; delete the dead
code and correct the documentation.

## Changes

- `backend/api/routers/firms.py`: extracted the dark-vessels SQL + scoring
  loop into module-level `query_dark_vessel_features(conn, *, bbox, …)`;
  the `/api/firms/dark-vessels` endpoint now calls it (behavior unchanged,
  including the Redis default-params cache).
- `backend/api/routers/ai_router.py`:
  - `analyze_sea_domain`: sparse-row heuristic replaced with
    `query_dark_vessel_features` over a mission-area bbox
    (±`_SEA_CONTEXT_RADIUS_KM`), MEDIUM+ candidates only
    (`min_risk_score=0.4`); context carries candidate count + top samples;
    risk formula now `indicators*0.15 + min(0.4, dark*0.1) +
    min(0.15, entities*0.005)`.
  - `analyze_air_domain`: ≥5-rows proxy replaced with the real pipeline —
    active zones from Redis filtered to `_AIR_CONTEXT_RADIUS_KM` (100 km) of
    the region center, plus `holding_pattern_events` history within the
    lookback window and radius; context carries active/history counts +
    samples; risk formula now `emergencies*0.4 + min(0.3, holding*0.1) +
    min(0.15, entities*0.005)` (entity-count baseline capped).
- `backend/ingestion/tak_clausalizer/service.py`: removed `message_batch`,
  `batch_size`, `batch_timeout_s`, `last_flush_time`, `flush_batch()`,
  `batch_flush_loop()`; `run()` is just the consumer loop.
- `Documentation/TAK_Clausalizer.md`: removed the batch-flush claims; fixed
  `POST /api/clausal-chains` → `GET /api/ai_router/clausal-chains`.

## Verification

- `backend/api`: 242 passed (4 new domain-agent tests: real holding zones
  surface / clausal row counts don't; FIRMS candidates surface / sparse AIS
  rows don't), ruff clean.
- `backend/ingestion/tak_clausalizer`: 51 passed, ruff clean.

## Benefits

- "Dark vessel" and "holding pattern" indicators now mean what they say —
  backed by FIRMS×AIS cross-referencing and turn-geometry detection instead
  of row-count proxies that flagged normal traffic.
- Busy-but-normal areas no longer inflate domain risk linearly (entity-count
  baseline capped at 0.15).
- The clausalizer's control flow matches its documentation.
