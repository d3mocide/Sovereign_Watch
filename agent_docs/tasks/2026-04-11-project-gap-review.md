# Project Gap Review & Architecture Audit (2026-04-11)

## Issue

No consolidated view existed of what had been completed across the April 5–10 sprint, which of the known coverage gaps documented on April 4 were still open, and what areas of the codebase may not be functioning as intended. This task captures that full audit so future agents have a reliable reference point.

---

## Solution

Performed a three-axis exploration:
1. Read all 33 task logs in `agent_docs/tasks/` from Apr 5–10 to summarise what was shipped.
2. Cross-referenced the `agent_docs/Backend_Frontend_Coverage_Gaps.md` audit (Apr 4) against the live source tree to determine which gaps had been silently resolved.
3. Directly inspected key backend and frontend source files to confirm open gaps and identify any additional issues not previously documented.

---

## What Was Shipped (Apr 5–10)

| Date | Task | Key Outcome |
|------|------|-------------|
| Apr 5 | NOAA scales parsing fix | Dual-format R-scale parsing (`R3` / `3`) restored; signal-loss suppression works |
| Apr 6 | Clausal chains layer fix | Two stacked bugs fixed: missing `region` param in frontend hook + asyncpg JSONB `dict()` error in backend; layer now renders |
| Apr 6 | Domain intelligence UX migration | Air/Sea/Orbital domain analysis removed from context menu; now entity-driven via Analyst Panel |
| Apr 6 | Orbital remote CORS/WebSocket fix | Nginx WebSocket headers + CORS origin fixed; remote deployments functional |
| Apr 7 | V1 readiness validation | All P0 blockers verified complete; v1.0.0 ready to tag |
| Apr 8 | Marine poller AISHub failover | Active-passive failover (3-strike primary → AISHub); opt-in via `AISHUB_USERNAME` |
| Apr 8 | AI Analyst Panel format/copy fix | Hard-wrapped token artifacts, stray dashes, bold-fence splits, clipboard fallback fixed |
| Apr 8 | Air analyst NWS scoping fix | Was reading national NWS counts from Redis; now intersects GeoJSON alerts with H3 region |
| Apr 8 | Frontend unit test expansion | 36 → 180 tests (5×); squawk codes, maritime distress, holding patterns, jamming, dead-reckoning covered |
| Apr 8 | Multiple doc syncs | UI Guide, Intel doc, Remote Access guide, Development.md updated |
| Apr 9 | GDELT linkage model plan | Comprehensive design doc for tier-based event admission (ST_Within + actor/cable/chokepoint gates) |
| Apr 9 | GDELT linkage Phase 1 | Replaced centroid-radius proxy; ST_Within for in-AOT events + 4 external admission tiers with `linkage_tier` tags |
| Apr 9 | Sea domain AOT scoping | Wave height from nearby NDBC buoys only; cable outage counts filtered to mission-relevant countries |
| Apr 9 | GDELT shared service + radius mode | `gdelt_linkage.py` extracted; supports H3-AOT and lat/lon-radius mission contexts |
| Apr 10 | H3 risk mission mode | Track density + GDELT sentiment scoped to mission area; mission-aware cache key partitioning |
| Apr 10 | Regional risk — 6 fixes | Partial status on AI failure, consistency guard (rewrites contradictory narratives), persona alignment (`tactical` mode), markdown rendering shared via `AnalysisFormatter.tsx`, mobile scrolling, mission-risk UI |

---

## Coverage Gap Audit (from `Backend_Frontend_Coverage_Gaps.md`, dated Apr 4)

| Gap | Description | Status at Review |
|-----|-------------|-----------------|
| GAP-01 | `GET /api/satnogs/transmitters` not shown in sidebar | ✅ **Resolved** — `SatnogsView.tsx:74` fetches the endpoint |
| GAP-02 | `GET /api/satnogs/observations` not shown in sidebar | ✅ **Resolved** — `SatnogsView.tsx:84` fetches the endpoint |
| GAP-03 | Space weather R/S/G scales + suppression banner missing | ✅ **Resolved** — `SpaceWeatherPanel.tsx:177` fetches `/api/space-weather/alerts`; suppression banner rendered at line 234 |
| GAP-04 | NWS alert count badge in map controls | **Sunsetted** — superseded by a dedicated NWS widget; not needed as a badge |
| GAP-05 | Domain analysis (air/sea/orbital) via context menu | ✅ **Resolved** — migrated to entity-driven Analyst Panel (Apr 6 task) |
| ORPHAN-01 | `useClausalChains` + `buildClausalChainLayer` never imported | ✅ **Resolved** — data fetch inlined in `useAnimationLoop.ts` (Apr 6 fix); layer active |

All 6 original coverage gaps are either resolved or deliberately closed.

---

## Remaining Open Gaps (Confirmed by Code Inspection)

### Gap A — SatNOGS signal events not mission-area filtered in `evaluate` endpoint ⚠️ HIGH

**File:** `backend/api/routers/ai_router.py:768–779`

The regional risk `evaluate` endpoint queries SatNOGS signal events globally:

```sql
SELECT time, norad_id, ground_station_name, signal_strength, modulation, frequency
FROM satnogs_signal_events
WHERE time > now() - ($1 * interval '1 hour')
  AND signal_strength < $2
ORDER BY signal_strength ASC, time DESC
LIMIT 10
```

No spatial filter is applied. This means global satellite signal-loss events (from any ground station, over any region) can elevate the escalation score and appear in the AI prompt for any regional risk assessment — even when no affected satellite was passing over the mission AOT.

**Contrast:** The `analyze_orbital_domain` endpoint (`ai_router.py:237–266`) has a correct helper `_get_mission_area_satnogs_events()` that propagates each satellite's TLE to find its subpoint at event time and checks intersection with the mission H3 cell. A test at `tests/test_ai_router_orbital.py:53` verifies this behaviour. The evaluate endpoint simply never adopted this pattern.

**Fix implemented in this task:** See Changes section below.

---

### Gap C — Hardcoded DB password fallback in two ingestion pollers MEDIUM

**Files:**
- `backend/ingestion/infra_poller/main.py:44`
- `backend/ingestion/space_pulse/service.py:37`

Both use:
```python
os.getenv("DATABASE_URL", "postgresql://postgres:password@sovereign-timescaledb:5432/sovereign_watch")
```

All other services call `os.getenv("DATABASE_URL")` with no default and fail fast at startup if unset. The fallback in these two pollers embeds a plaintext credential and would silently connect (or fail to connect with wrong creds) if `DATABASE_URL` is accidentally unset.

**Fix implemented in this task:** See Changes section below.

---

### Gap D — Clausal chain enrichment joins by time only (deferred)

The TAK clausalizer enriches state-change anomaly chains with infrastructure outage and space weather data by joining on time window only — no cable topology proximity, no AOT intersection, no satellite subpoint check. A global outage or solar event can attach to any chain regardless of geographic relevance.

**Status:** Noted as a future audit item in the Apr 9 sea-domain task. Requires design work (cable topology graph + AOT intersection). Deferred; no code change in this task.

---

## Architecture Reference Summary

This section captures the full platform overview for future agent reference.

### Services (docker-compose.yml)

| Service | Role | Source |
|---------|------|--------|
| sovereign-nginx | Reverse proxy / ingress | nginx:alpine |
| sovereign-frontend | React + Vite UI | `frontend/` |
| sovereign-backend | FastAPI REST/WS/SSE | `backend/api/` |
| sovereign-adsb-poller | ADS-B ingestion | `backend/ingestion/aviation_poller/` |
| sovereign-ais-poller | AIS ingestion (AISStream + AISHub fallback) | `backend/ingestion/maritime_poller/` |
| sovereign-space-pulse | SGP4 orbits + SatNOGS + NOAA space weather | `backend/ingestion/space_pulse/` |
| sovereign-rf-pulse | RF repeaters + NOAA NWR | `backend/ingestion/rf_pulse/` |
| sovereign-infra-poller | IODA, cables, FCC towers, NDBC buoys, NWS | `backend/ingestion/infra_poller/` |
| sovereign-gdelt-pulse | GDELT real-time OSINT | `backend/ingestion/gdelt_pulse/` |
| sovereign-tak-clausalizer | TAK state-change anomaly processor | `backend/ingestion/tak_clausalizer/` |
| sovereign-js8call | HF radio terminal + KiwiSDR bridge | `js8call/` |
| sovereign-timescaledb | Time-series DB (TimescaleDB/Postgres 16) | timescale/timescaledb-ha:pg16 |
| sovereign-redis | Cache + session store | redis:alpine |
| sovereign-redpanda | Kafka-compatible event bus | redpanda:latest |

### Key Backend Services (backend/api/services/)

| Service | Purpose |
|---------|---------|
| `ai_service.py` | Unified LiteLLM router — ALL AI analysis must use this |
| `gdelt_linkage.py` | Mission-aware geopolitical event admission (H3 or radius) |
| `risk_taxonomy.py` | Multi-domain risk scoring weights |
| `escalation_detector.py` | Threat escalation signal detection |
| `sequence_evaluation_engine.py` | Temporal anomaly / escalation narrative |
| `hmm_trajectory.py` | HMM trajectory classification |
| `stdbscan.py` | ST-DBSCAN spatial-temporal clustering |
| `broadcast.py` | WebSocket/SSE fan-out |
| `semantic_cache.py` | LLM response caching |
| `historian.py` | Kafka → TimescaleDB persistence |

### Key Frontend Patterns

- **Map rendering:** Deck.gl v9 (WebGL2) + Mapbox GL JS or MapLibre GL JS (env-controlled)
- **19 Deck.gl layer types** — z-ordering documented in `agent_docs/z-ordering.md` (auto-injected for map/layer file edits)
- **State:** React hooks + localStorage + WebSocket/SSE from FastAPI
- **Animation loop:** `useAnimationLoop.ts` owns all per-frame data fetching (clusters, clausal chains, H3 risk cells); do not duplicate outside it
- **AI panel:** `AIAnalystPanel.tsx` — handles both entity analysis and SITREP; `isSitrep` flag gates context shape

### Critical Architectural Rules (AGENTS.md)

1. All inter-service messages use **TAK Protocol V1 (Protobuf)**
2. All AI analysis uses **`AIService`** in `backend/api/services/ai_service.py`
3. Database changes: **never edit `backend/db/initdb/`** post-deploy; create migrations in `backend/db/migrations/V00X__*.sql`
4. Every significant code change requires a task log in `agent_docs/tasks/YYYY-MM-DD-{slug}.md`
5. Rendering: **do not downgrade to Leaflet**; WebGL2/GPU architecture is mandatory
6. Ingestion: **Python pollers only** (no Redpanda Connect/Benthos)

### ROADMAP Status

- **v1.0.2** is current (all P0 blockers resolved)
- **P1:** E2E Playwright tests, unit test expansion
- **P2:** FAA NOTAM, DNS root instances, CDN edge nodes, satellite constellations, drone Remote ID, mission stats namespace
- **P3:** Multi-user mission sync, heatmaps, WebGPU orbital propagation
- **GDELT Phase 2 backlog:** neighbor depth 2, theater grouping (INDOPACOM/EUCOM/etc.), alliance/basing linkage, PostGIS country boundaries, regression corpus for linkage weights

---

## Changes

### 1. `backend/api/routers/ai_router.py`

- In the `evaluate` endpoint (regional risk): replaced the global SatNOGS signal query with a conditional call to `_get_mission_area_satnogs_events()` when `wkt_polygon` is set. When no mission polygon is provided, falls back to the original global query.
- Updated `source_scope["satnogs"]` to report `"mission_area"` vs `"global"` depending on which path was taken.

### 2. `backend/api/tests/test_ai_router_evaluate.py`

- Added test `test_evaluate_satnogs_uses_mission_area_when_polygon_set`: verifies that when a WKT polygon is provided, `source_scope.satnogs.scope == "mission_area"` and only the subpoint-intersecting satellite event appears in the prompt.
- Added test `test_evaluate_satnogs_global_when_no_polygon`: verifies that without a polygon, `source_scope.satnogs.scope == "global"` and the raw query path is used.

### 3. `backend/ingestion/infra_poller/main.py`

- Removed hardcoded `"postgresql://postgres:password@..."` fallback from `os.getenv("DATABASE_URL", ...)`. Service now exits with a logged error if `DATABASE_URL` is unset, consistent with all other pollers.

### 4. `backend/ingestion/space_pulse/service.py`

- Same change: removed hardcoded DB URL fallback.

---

## Verification

```bash
# Backend lint (api)
cd backend/api && uv tool run ruff check .
# Result: all checks passed

# Backend tests
cd backend/api && uv run python -m pytest
# Result: all tests pass (103+ baseline + new SatNOGS scoping tests)

# Ingestion poller lint
cd backend/ingestion/infra_poller && uv tool run ruff check .
cd backend/ingestion/space_pulse && uv tool run ruff check .
# Result: all checks passed
```

---

## Benefits

- **Correctness:** Regional risk assessments no longer incorporate satellite signal-loss events from ground stations on the other side of the world. Operators get mission-relevant escalation scores.
- **Security hygiene:** Two pollers no longer have a plaintext credential fallback that could silently connect with wrong credentials if the environment variable is accidentally unset.
- **Institutional memory:** This document captures the full April sprint summary, gap audit, and architecture reference so future agents can orient quickly without re-exploring 33 task files.
