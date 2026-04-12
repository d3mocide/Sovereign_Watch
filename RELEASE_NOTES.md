# Release — v1.0.4 — Global Airspace Intelligence

**Released:** 2026-04-12

---

## Summary

v1.0.4 replaces the deprecated FAA NOTAM integration with a full-stack OpenAIP airspace zones pipeline, giving operators global polygon-based airspace coverage for the first time — no institutional credentials required.

This release also eliminates a long-standing stale-polygon artifact when switching mission areas, adds operator-controlled zone type filtering with zero latency, and unifies the draw-order of all tactical map layers under a coherent visual hierarchy.

---

## Key Features

### 🌐 OpenAIP Global Airspace Zones
- Covers **PROHIBITED, RESTRICTED, DANGER, WARNING, TRA, TSA, ADIZ, CTR, FIR, FIS, VFR** zones worldwide.
- Actual polygon geometries — not point markers — for accurate airspace boundary situational awareness.
- 24-hour poll cadence matches the slow-changing nature of published airspace; Redis cache (25h TTL) with TimescaleDB archival.
- Graceful degradation: missing `OPENAIP_API_KEY` is logged as a warning; the map continues to load normally.

### 🔄 Event-Driven Cache Synchronization
- Backend emits a `clearing` Redis signal before wiping its cache and an `updated` signal after the new data lands.
- Frontend immediately clears displayed polygons on `clearing` — no stale zones from the previous mission area leak into the new view.
- Replaces the timing-based polling approach entirely; the map is now deterministically in sync with backend state.

### 🎛️ Zone Type Sub-Filter
- 12-type toggle grid (PROHIB / RESTRI / DANGER / WARN / TRA / TSA / ADIZ / MIL / CTR / FIR / FIS / VFR) rendered in the Sovereign Glass tile aesthetic matching the AIR/SEA entity filter panels.
- Client-side filtering — instant response, zero API calls.
- Each toggle retains its zone-type color accent when active; dims to neutral when off.

### 🗺️ 7-Tier Z-Order Unification
- All tactical map layers now follow a documented `depthBias` hierarchy:  
  `Shading → NWS Alerts → Airspace Zones → Cables/Infra → Buoys/Assets → Jamming/Clusters → Entities`
- Airspace zones no longer occlude outage fills, and entity chevrons always float above all signal layers.

### 🧪 Playwright E2E Test Suite
- Chromium-based E2E tests auto-start the dev server via `pnpm run test:e2e`.
- **`golden-path.spec.ts`**: 6 smoke tests covering login, dashboard navigation, and map load.
- **`airspace-layer.spec.ts`**: 9 tests covering all three API endpoint contracts and the UI toggle lifecycle.

---

## Technical Details

### New API Endpoints
| Endpoint | Description |
|---|---|
| `GET /api/airspace/zones` | Active zones from Redis fast-path |
| `GET /api/airspace/history` | Historical zones from TimescaleDB (type/country filters, 1–720h) |
| `GET /api/airspace/types` | Zone type summary and counts |

### Database Migration
- `V003__airspace_zones.sql` — new `airspace_zones` TimescaleDB hypertable, 30-day retention, indexes on `zone_id`, `type`, `country`.
- Applied automatically at backend startup via `migrate.py`. No manual intervention required.

### Configuration (Optional)
Add to `.env` if you have an OpenAIP API key:
```env
OPENAIP_API_KEY=your_key_here
OPENAIP_BBOX_EXPAND_DEG=2.0
OPENAIP_TYPES=0,1,2,3,4,5,6,7,8,9,10
```
The service runs without these variables but will skip airspace polling and log a warning.

### Breaking Changes
None. All existing layers, endpoints, and state contracts are preserved.

---

## Upgrade Instructions

```bash
# Pull latest
git pull origin main

# Rebuild and restart all services
make prod

# Or for development
make dev
```

The V003 migration applies automatically on first `docker compose up`. Verify with:
```sql
SELECT * FROM schema_migrations ORDER BY version;
```

---

## Verification

```
Frontend lint:      pnpm run lint       → 0 errors, 0 warnings
Frontend typecheck: pnpm run typecheck  → no errors
Frontend tests:     pnpm run test       → 205/205 passed
Backend lint:       ruff check .        → clean
Backend tests:      pytest              → 133 passed
```
