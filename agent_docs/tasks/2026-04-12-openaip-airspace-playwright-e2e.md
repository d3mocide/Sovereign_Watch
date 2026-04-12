# OpenAIP Airspace Zones Integration + Playwright E2E Test Suite

**Date:** 2026-04-12
**Branch:** `claude/plan-next-features-ouyxU`
**Replaces:** `2026-04-11-faa-notam-playwright-e2e.md` (NOTAM sprint — reverted due to FAA API deprecation)

---

## Issue

The previous sprint built a FAA NOTAM integration that was subsequently reverted because the FAA Digital-NOTAM Exchange API has been deprecated and migrated to the NMS-API, which requires a .gov account that is not readily available.

The platform needed an alternative aviation hazard layer that:
- Is globally comprehensive (not US-only)
- Does not require .gov or institutional credentials
- Provides actual airspace boundary polygons (not just point notices)
- Covers tactically relevant restriction types

Additionally, Playwright had been installed and configured (from the NOTAM sprint) but needed E2E tests for the replacement airspace feature.

---

## Solution

### OpenAIP Airspace Zones Integration (full-stack)

Replaced the NOTAM pipeline with an OpenAIP-based airspace zones pipeline:

- **Data source**: OpenAIP (`api.core.openaip.net`) — free, email-only signup, global coverage, returns GeoJSON polygon geometries for restricted/danger/prohibited airspace zones.
- **Ingestion**: `OpenAIPSource` polls every 24 hours (airspace boundaries are largely static), computes a bbox from the mission center + radius, paginates with `limit=1000`, writes a GeoJSON FeatureCollection to Redis key `airspace:zones` (25h TTL), and archives each zone row to TimescaleDB.
- **Backend API**: Three endpoints — active zones (Redis cache), historical zones (TimescaleDB with type/country filters, 1-720h window), and type summary.
- **Frontend layer**: Single `GeoJsonLayer` with translucent polygon fills (alpha=45) and solid borders (alpha=200), colour-coded by zone type.
- **Layer toggle**: Added to the Hazards group in `LayerVisibilityControls.tsx` with an orange accent; off by default.
- **Credentials**: Graceful degradation — if `OPENAIP_API_KEY` is absent the source logs a warning and skips without crashing.

### Playwright E2E Tests (airspace spec)

Added `e2e/airspace-layer.spec.ts` replacing the deleted `e2e/notam-layer.spec.ts`:
- All three API endpoint contracts (`/api/airspace/zones`, `/api/airspace/history`, `/api/airspace/types`)
- Input validation (hours > 720 → 422)
- Type and country filter acceptance
- Layer toggle presence in the UI
- Toggle does not crash the map (zero JS errors)

---

## Changes

### Removed (NOTAM files)
| File | Action |
|---|---|
| `backend/db/migrations/V003__faa_notam_events.sql` | Deleted |
| `backend/ingestion/aviation_poller/notam_source.py` | Deleted |
| `backend/api/routers/notam.py` | Deleted |
| `backend/api/tests/test_notam_router.py` | Deleted |
| `frontend/src/hooks/useNOTAMs.ts` | Deleted |
| `frontend/src/layers/buildNOTAMLayer.ts` | Deleted |
| `frontend/src/layers/buildNOTAMLayer.test.ts` | Deleted |
| `frontend/e2e/notam-layer.spec.ts` | Deleted |

### Backend — New/Modified
| File | Change |
|---|---|
| `backend/db/migrations/V003__airspace_zones.sql` | New — TimescaleDB hypertable, 30-day retention, indexes on zone_id/type/country |
| `backend/ingestion/aviation_poller/openaip_source.py` | New — `OpenAIPSource` class; 24h poll, bbox from mission center, pagination, Redis + DB archive |
| `backend/ingestion/aviation_poller/service.py` | Wired `OpenAIPSource` into `__init__`, `setup()`, `loop()`, `shutdown()` |
| `.env.example` | [FIX] Added `OPENAIP_API_KEY`, `OPENAIP_BBOX_EXPAND_DEG`, and `OPENAIP_TYPES` documentation |
| `docker-compose.yml` | [FIX] Passed OpenAIP variables to `sovereign-adsb-poller` container environment |
| `backend/api/routers/airspace.py` | New — `GET /api/airspace/zones`, `/api/airspace/history`, `/api/airspace/types` |
| `backend/api/main.py` | Imported `airspace` router; registered with `_viewer_auth` |
| `backend/api/tests/test_airspace_router.py` | New — 11 unit tests (all passing) |

### Frontend — New/Modified
| File | Change |
|---|---|
| `frontend/src/hooks/useAirspaceZones.ts` | New — fetch hook, 6h refresh, enabled guard, FeatureCollection validation |
| `frontend/src/layers/buildAirspaceLayer.ts` | New — single GeoJsonLayer, polygon fill+border, 7-type colour palette, globe/merc support |
| `frontend/src/layers/buildAirspaceLayer.test.ts` | New — 18 Vitest unit tests (all passing) |
| `frontend/src/layers/composition.ts` | Added `airspaceZonesData` prop + `buildAirspaceLayer` call |
| `frontend/src/hooks/useAnimationLoop.ts` | Added `airspaceZonesData` to options, ref sync, passed to `composeAllLayers` |
| `frontend/src/components/map/TacticalMap.tsx` | Added `airspaceZonesData` state + fetch effect; passed to animation loop |
| `frontend/src/types.ts` | Added `showAirspaceZones?: boolean` to `MapFilters` |
| `frontend/src/hooks/useAppFilters.ts` | Added `showAirspaceZones: false` to default filter map |
| `frontend/src/components/widgets/LayerVisibilityControls.tsx` | Added AIRSPACE ZONES toggle (orange accent, AlertTriangle icon) to Hazards group |
| `frontend/e2e/airspace-layer.spec.ts` | New — 9 E2E tests covering API contracts + UI toggle |

### Frontend — Kept from previous sprint
| File | Change |
|---|---|
| `frontend/vite.config.ts` | `test.exclude: ["e2e/**"]` to prevent Vitest/Playwright conflict |
| `frontend/playwright.config.ts` | Playwright config (Chromium, auto dev-server, CI-compatible) |
| `frontend/e2e/helpers.ts` | Page Object helpers: loginAsAdmin, openLayerPanel, toggleLayer, setMissionArea |
| `frontend/e2e/golden-path.spec.ts` | 6 golden path smoke tests |
| `frontend/package.json` | `test:e2e` and `test:e2e:ui` scripts |

---

## Verification

```
# Backend lint + tests (133 total passing, 11 airspace-specific)
cd backend/api && uv tool run ruff check .              → All checks passed
cd backend/api && uv run python -m pytest               → 133 passed

# Frontend lint + typecheck + Vitest (205 total passing, 18 airspace-specific)
cd frontend && pnpm run lint                            → 0 errors, 0 warnings
cd frontend && pnpm run typecheck                       → no type errors
cd frontend && pnpm run test                            → 14 test files, 205 passed
```

E2E tests (`pnpm run test:e2e`) require a running app instance — not run in Vitest CI suite.

---

## Benefits

- **Global airspace coverage**: Restricted, Danger, Prohibited, Warning, TRA, TSA, and ADIZ zones visible worldwide — not limited to US/FAA sources.
- **Actual boundaries**: Polygon geometries (not point markers) give operators accurate situational awareness of airspace extents.
- **No institutional credentials**: OpenAIP requires only a free email signup — accessible to any team.
- **Static-data-friendly polling**: 24-hour poll cadence matches the slow-changing nature of published airspace, minimising API load.
- **Graceful degradation**: No API key = source skips cleanly; map still loads normally.
- **E2E test coverage**: All three API endpoints and the UI toggle tested; foundation for future airspace-specific alert rules.
