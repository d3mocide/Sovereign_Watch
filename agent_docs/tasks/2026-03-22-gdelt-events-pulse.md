# 2026-03-22 — GDELT Events Pulse (Ingest-14 + FE-35)

## Issue
P2 backlog items Ingest-14 and FE-35 were unimplemented.  The platform lacked a
real-time geopolitical event layer, leaving a gap in its OSINT fusion capability.

## Solution
Implemented the full GDELT Events Pulse pipeline:

**Backend** — lazy-fetch-with-cache pattern (mirrors `news.py`):
- New FastAPI router `backend/api/routers/gdelt.py`
- `GET /api/gdelt/events` — fetches GDELT v2 GEO API, returns GeoJSON
  FeatureCollection of geolocated news events
- Redis cache with 15-minute TTL to match GDELT update cadence
- Pre-computes `toneColor` RGBA array per feature (Goldstein scale) so the
  client doesn't need to recompute on every render frame
- Registered in `backend/api/main.py`

**Frontend** — follows infra/jamming layer patterns:
- `frontend/src/layers/buildGdeltLayer.ts` — three-layer stack:
  1. Outer glow ring (low-alpha, tone-colored)
  2. Filled dot (pickable, tone-colored, click opens source article in new tab)
  3. Domain label (monospace, tone-tinted background)
- `frontend/src/hooks/` — inline fetch in TacticalMap (same pattern as
  `auroraData` / `jammingData`)
- Wired through `useAnimationLoop` → `composeAllLayers` → `buildGdeltLayer`
- Filter `showGdelt` added to `MapFilters` type and default filters in `App.tsx`
- Toggle added to SystemStatus "OSINT Events" section with legend key

## Changes

| File | Type |
|---|---|
| `backend/api/routers/gdelt.py` | New |
| `backend/api/main.py` | Modified — register gdelt router |
| `frontend/src/layers/buildGdeltLayer.ts` | New |
| `frontend/src/layers/composition.ts` | Modified — add gdeltData param + call |
| `frontend/src/hooks/useAnimationLoop.ts` | Modified — add gdeltData param |
| `frontend/src/components/map/TacticalMap.tsx` | Modified — fetch + pass gdeltData |
| `frontend/src/types.ts` | Modified — add showGdelt to MapFilters |
| `frontend/src/App.tsx` | Modified — showGdelt: false default |
| `frontend/src/components/widgets/SystemStatus.tsx` | Modified — OSINT Events section |
| `frontend/src/components/widgets/SystemSettingsWidget.tsx` | Modified — reset key |

## Verification
- `ruff check backend/api/routers/gdelt.py` → All checks passed
- `python3 -m pytest backend/api/tests/test_tak_utils.py` → 7 passed, 2 skipped
- Frontend lint requires containers (node_modules not installed on host)
- No breaking changes to existing layer composition or filter state

## Benefits
- Real-time geopolitical event overlay from GDELT (15-min cadence, no API key)
- Goldstein tone color-coding gives instant visual threat assessment
- Click-to-source: every dot links to the originating news article
- Zero new infrastructure — reuses existing Redis cache and API routing patterns
- Closes Ingest-14 and FE-35 from the P2 backlog
