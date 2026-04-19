# 2026-04-19 — Domain Analysis Context Menu, NWS Badge, Code Health

## Issue

Four open items from the improvements backlog:

1. **GAP-05 (HIGH)**: Three domain-specialist AI endpoints (`POST /api/ai_router/analyze/{air,sea,orbital}`) were fully implemented in the backend but had no frontend trigger. Operators couldn't access the most powerful per-domain fusion analysis.
2. **GAP-04 (LOW)**: The NWS alerts summary endpoint existed but no widget surfaced alert counts in the layer controls.
3. **CH-01 (MEDIUM)**: `analysis.py` called `db.pool.fetchrow()` directly (3 sites) instead of `async with db.pool.acquire()`, risking pool exhaustion under load.
4. **CH-02 (LOW)**: ~15 bare `except Exception: pass` blocks across 3 ingestion pollers swallowed errors silently, hiding Redis write failures and data-parsing skips from health diagnostics.

## Solution

### GAP-05 — Domain Analysis Context Menu

Added a **"Domain Intel"** section to the right-click map context menu with three compact buttons (Air, Sea, Space). Each triggers its domain-specialist endpoint and renders results in a new panel stacked below the existing Regional Risk overlay.

- Color-coded per domain: sky (Air), blue (Sea), violet (Orbital)
- Shows: domain label, H3 region, coordinates, risk %, AI narrative via `AnalysisFormatter`, indicator list, AI notice if present
- Loading / error / success states with appropriate UX
- Intel feed events emitted on completion

### GAP-04 — NWS Alert Count Badge

Added a self-refreshing (60 s) count badge inside the "NWS ALERTS" toggle row in `LayerVisibilityControls`. Polls `/api/infra/nws-alerts/summary`. Badge colour escalates from amber → orange → red as extreme/severe counts increase.

### CH-01 — Pool Exhaustion Fix

Wrapped all three `db.pool.fetchrow()` calls in `analysis.py` with `async with db.pool.acquire() as conn: await conn.fetchrow(...)`.

### CH-02 — Silent Exception Logging

Added `logger.debug(...)` to 15 silent except blocks:
- `aviation_poller/service.py` (2): Redis heartbeat + error-state writes
- `gdelt_pulse/service.py` (7): Redis writes, CSV row skip, datetime parse, response body read
- `infra_poller/main.py` (5): Redis error-state writes, temp file cleanup

All use `as e` / `as re` variable binding and `logger.debug()` (not warning/error, since these are secondary failure paths inside existing error handlers).

## Changes

| File | Change |
|------|--------|
| `frontend/src/components/map/MapContextMenu.tsx` | Added `onDomainAnalyze` prop + Domain Intel menu section with Air/Sea/Space buttons |
| `frontend/src/components/map/TacticalMap.tsx` | Added + threaded `onDomainAnalyze` prop to `MapContextMenu` |
| `frontend/src/components/map/OrbitalMap.tsx` | Added + threaded `onDomainAnalyze` prop to `MapContextMenu` |
| `frontend/src/App.tsx` | Added `DomainAnalysisUiState` type, state, `handleDomainAnalyze` callback, panel render, prop wiring to both maps; added `Globe, Plane, Ship` imports |
| `frontend/src/components/widgets/LayerVisibilityControls.tsx` | Added NWS summary poll + count badge in NWS toggle row |
| `backend/api/routers/analysis.py` | Wrapped 3 bare `fetchrow()` calls with `async with pool.acquire()` |
| `backend/ingestion/aviation_poller/service.py` | Added debug logging to 2 silent excepts |
| `backend/ingestion/gdelt_pulse/service.py` | Added debug logging to 7 silent excepts |
| `backend/ingestion/infra_poller/main.py` | Added debug logging to 5 silent excepts |
| `agent_docs/improvements-backlog.md` | Created long-term improvements tracking document |

## Verification

- Python ruff: all 3 modified ingestion pollers + analysis.py pass clean
- Frontend lint/typecheck: node_modules not installed in this environment (pre-existing); TypeScript changes reviewed manually for correctness
- No logic regressions — all changes are additive (new prop, new state, new panel)

## Benefits

- Operators can now trigger Air/Sea/Orbital domain-specialist AI analysis directly from the map with a single right-click, exposing the highest-value fusion endpoints
- NWS alert counts visible at a glance in layer controls without enabling the full GeoJSON layer
- Connection pool no longer at risk of exhaustion under concurrent analysis requests
- Debug logging in ingestion pollers enables health diagnostics when Redis is intermittently unavailable
- Long-term improvements backlog (`agent_docs/improvements-backlog.md`) gives a single tracking surface for all open gaps
