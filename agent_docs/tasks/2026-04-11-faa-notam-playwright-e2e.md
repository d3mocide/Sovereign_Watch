# FAA NOTAM Integration + Playwright E2E Test Suite

**Date:** 2026-04-11
**Branch:** `claude/plan-next-features-ouyxU`

---

## Issue

The platform had no awareness of FAA-issued Notices to Air Missions (NOTAMs), which include critical airspace restrictions such as Temporary Flight Restrictions (TFRs), GPS outage zones, obstacle warnings, and MOA activations. Operators had no way to see active NOTAMs on the tactical map or receive early warning when tracked aircraft entered restricted airspace.

Additionally, the project had Playwright installed (`v1.58.2`) but no configuration or E2E tests — leaving the "golden path" mission workflow completely untested at the integration level.

---

## Solution

### FAA NOTAM Integration (full-stack)

Built a complete NOTAM ingestion and display pipeline:
- **Ingestion**: `NOTAMSource` polls the FAA Digital-NOTAM Exchange API every 10 minutes, parses and normalizes records, writes a GeoJSON FeatureCollection to Redis (15-min TTL), and archives to TimescaleDB for 7 days.
- **Backend API**: Three endpoints — active (Redis cache), history (TimescaleDB with keyword/classification filters), and detail lookup by NOTAM ID (supports slash-containing IDs via `:path` route).
- **Frontend layer**: Three-layer deck.gl composition — pulsed outer halo + inner pickable dot + label text — with 15 distinct category colours (TFR=red, GPS_OUTAGE=yellow, OBSTACLE=purple, etc.).
- **Layer toggle**: Added to the Hazards group in `LayerVisibilityControls.tsx` with a red accent; off by default (NOTAMs are operator-opt-in).
- **Credentials**: Graceful degradation — if `FAA_NOTAM_CLIENT_ID` / `FAA_NOTAM_CLIENT_SECRET` are absent the source logs a warning and skips without crashing the rest of the aviation poller.

### Playwright E2E Setup

Wired Playwright from zero to a runnable configuration:
- `playwright.config.ts` — Chromium, auto-starts Vite dev server when running locally, CI-compatible via `BASE_URL` env var.
- `e2e/helpers.ts` — `loginAsAdmin()`, `openLayerPanel()`, `toggleLayer()`, `setMissionArea()` Page Object helpers.
- `e2e/golden-path.spec.ts` — 6 smoke tests covering app boot, map canvas render, zero unhandled JS errors, layer controls accessibility, API health endpoint, and stats panel reachability.
- `e2e/notam-layer.spec.ts` — 8 tests covering NOTAM toggle presence, checkbox toggling, all three API endpoint contracts, input validation (hours > 168 returns 422), and network request verification on toggle enable.
- `pnpm run test:e2e` script added to `package.json`.

---

## Changes

### Backend
| File | Change |
|---|---|
| `backend/db/migrations/V003__faa_notam_events.sql` | New — TimescaleDB hypertable, 7-day retention, indexes on notam_id, icao_id, keyword |
| `backend/ingestion/aviation_poller/notam_source.py` | New — `NOTAMSource` class, FAA API pagination, Redis cache write, DB archive |
| `backend/ingestion/aviation_poller/service.py` | Imported + wired `NOTAMSource`: `__init__`, `setup()`, `loop()`, `shutdown()` |
| `backend/api/routers/notam.py` | New — `GET /api/notam/active`, `/api/notam/history`, `/api/notam/{notam_id:path}` |
| `backend/api/main.py` | Imported `notam` router; registered with `_viewer_auth` |
| `backend/api/tests/test_notam_router.py` | New — 10 unit tests, 10/10 passing |

### Frontend
| File | Change |
|---|---|
| `frontend/src/hooks/useNOTAMs.ts` | New — fetch hook, 10-min refresh, enabled guard, type-safe FeatureCollection validation |
| `frontend/src/layers/buildNOTAMLayer.ts` | New — three GeoJsonLayer composition (halo/dot/label), 15 category colours, globe/merc support |
| `frontend/src/layers/buildNOTAMLayer.test.ts` | New — 8 Vitest unit tests for layer builder |
| `frontend/src/layers/composition.ts` | Added `notamData` prop + `buildNOTAMLayer` call (just above holding pattern layer) |
| `frontend/src/hooks/useAnimationLoop.ts` | Added `notamData` to `UseAnimationLoopOptions`, ref sync, passed to `composeAllLayers` |
| `frontend/src/components/map/TacticalMap.tsx` | Added `notamData` state + `useEffect` fetch (10-min cadence); passed to animation loop |
| `frontend/src/types.ts` | Added `showNOTAMs?: boolean` to `MapFilters` |
| `frontend/src/hooks/useAppFilters.ts` | Added `showNOTAMs: false` to default filter map |
| `frontend/src/components/widgets/LayerVisibilityControls.tsx` | Added FAA NOTAMs toggle (red accent) to Hazards group; updated `hazardsIsOn` + `toggleHazards` |
| `frontend/vite.config.ts` | Added `test.exclude: ["e2e/**"]` to prevent Vitest picking up Playwright specs |
| `frontend/playwright.config.ts` | New — Playwright config (Chromium, local dev server auto-start, CI-compatible) |
| `frontend/e2e/helpers.ts` | New — Page Object helpers: loginAsAdmin, openLayerPanel, toggleLayer, setMissionArea |
| `frontend/e2e/golden-path.spec.ts` | New — 6 golden path smoke tests |
| `frontend/e2e/notam-layer.spec.ts` | New — 8 NOTAM API + UI tests |
| `frontend/package.json` | Added `test:e2e` and `test:e2e:ui` scripts |

---

## Verification

```
# Backend lint + tests (10/10 passing)
cd backend/api && uv tool run ruff check .        → All checks passed
cd backend/api && uv run python -m pytest tests/test_notam_router.py -v → 10 passed

cd backend/ingestion/aviation_poller && uv tool run ruff check . → All checks passed

# Frontend lint + typecheck + Vitest (196 tests passing)
cd frontend && pnpm run lint       → 0 errors, 0 warnings
cd frontend && pnpm run typecheck  → no type errors
cd frontend && pnpm run test       → 14 test files, 196 passed
```

E2E tests (`pnpm run test:e2e`) require a running app instance — they are not run in the CI Vitest suite.

---

## Benefits

- **Operator situational awareness**: TFRs, GPS outages, obstacles, and other airspace notices now visible on the tactical map with pulsed markers colour-coded by hazard type.
- **Early warning**: When a tracked aircraft enters a NOTAM zone, operators can cross-reference visually — foundation for a future alert rule.
- **Graceful degradation**: No FAA credentials = source skips cleanly; the map still loads normally.
- **E2E test foundation**: Playwright is now configured and has a golden-path suite. All future feature development can extend `e2e/` without any setup work.
- **API flexibility**: NOTAM history supports keyword and classification filters, enabling operators to query just GPS outages, just TFRs, etc.
