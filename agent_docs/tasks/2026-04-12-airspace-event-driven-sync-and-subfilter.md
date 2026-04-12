# Task: Airspace Event-Driven Sync & Zone-Type Sub-Filter

**Date:** 2026-04-12

---

## Issue

Two separate issues needed resolution after the initial OpenAIP integration:

1. **Race condition on mission area shift**: The airspace layer was rendering stale polygons from the previous mission area when the operator switched regions. The original polling approach fetched on a timer, creating a window where old data remained visible while the backend was still clearing its cache.

2. **No granular zone filtering**: Operators had a single on/off toggle for Airspace Zones but no way to selectively display only the zone types relevant to their mission (e.g., show PROHIBITED and RESTRICTED but hide FIR/FIS).

---

## Solution

### Event-Driven Two-Signal Architecture

Replaced the timing-based polling approach with a deterministic WebSocket event-driven model matching the COT tracking architecture:

- **Backend** (`openaip_source.py`): Publishes a `"clearing"` Redis signal before cache deletion and an `"updated"` signal after the new data is written. This gives the frontend two distinct events to act on.
- **Frontend** (`WorkerProtocol.ts`): Extended JSON signal parsing alongside binary Protobuf COT data to forward signals to the UI.
- **Frontend** (`TacticalMap.tsx`): Replaced timing-based hacks with a two-signal handler:
  - `"clearing"` → immediately wipe `airspaceZonesData`, `holdingPatternData`, and `jammingData` state.
  - `"updated"` → fetch fresh data from the backend (data is guaranteed available).
  - Cold-start stabilization: 500ms delay on initial page load to ensure the poller has completed its first cycle.

### Client-Side Zone Type Sub-Filter

Added a 2-column grid of zone type toggles (matching the AIR/SEA sub-filter aesthetic exactly) that appears when Airspace Zones is enabled:

- **`types.ts`**: Added `airspaceZoneTypes?: string[]` to `MapFilters`.
- **`useAppFilters.ts`**: Default allow-list: `["PROHIBITED", "RESTRICTED", "DANGER", "WARNING", "TRA", "TSA", "ADIZ", "MILITARY"]`.
- **`buildAirspaceLayer.ts`**: Added `enabledTypes` parameter; filters features client-side before passing to `GeoJsonLayer`. Zero API calls — instant filtering from in-memory data. `updateTriggers` keyed on the sorted type list to ensure re-render on toggle.
- **`composition.ts`**: Passes `filters.airspaceZoneTypes` as `enabledTypes` to the layer builder.
- **`LayerVisibilityControls.tsx`**: Added 12-type sub-filter grid (PROHIB, RESTRI, DANGER, WARN, TRA, TSA, ADIZ, MIL, CTR, FIR, FIS, VFR) using the same bordered tile + icon + toggle pill pattern as the AIR/SEA entity type filters.

### Type Chain Widening

The `onFilterChange` callback chain (`useAppFilters` → `SidebarLeft` → `SystemStatus` → `LayerVisibilityControls`) was typed as `boolean | number`. Widened to `boolean | number | string[]` to allow `airspaceZoneTypes` (a `string[]`) to flow through without casts.

---

## Changes

### Backend
| File | Change |
|---|---|
| `backend/ingestion/aviation_poller/openaip_source.py` | Added `clearing` and `updated` Redis pub/sub signals |
| `backend/api/services/broadcast.py` | Subscribed to `airspace:zones` channel for real-time broadcast |
| `backend/ingestion/aviation_poller/service.py` | Made `update_mission_area` async to synchronize cache clearing |

### Frontend
| File | Change |
|---|---|
| `frontend/src/workers/WorkerProtocol.ts` | Added `onWsMessage` callback and JSON signal parsing |
| `frontend/src/App.tsx` | Wired `wsSignal` state and passed it to `TacticalMap` |
| `frontend/src/components/map/TacticalMap.tsx` | Two-signal event handler, cold-start stabilization, `useCallback` dep fix |
| `frontend/src/types.ts` | Added `airspaceZoneTypes?: string[]` to `MapFilters` |
| `frontend/src/hooks/useAppFilters.ts` | Added default `airspaceZoneTypes`, widened `handleFilterChange` to `boolean \| string[]` |
| `frontend/src/layers/buildAirspaceLayer.ts` | Added `enabledTypes` param with client-side feature filtering |
| `frontend/src/layers/composition.ts` | Passes `enabledTypes` from filters to `buildAirspaceLayer` |
| `frontend/src/layers/buildAirspaceLayer.test.ts` | Updated stale alpha constant expectations (fill=65, line=255) |
| `frontend/src/components/widgets/LayerVisibilityControls.tsx` | 12-type sub-filter grid; widened `handleSubFilterChange` to `boolean \| string[]` |
| `frontend/src/components/widgets/SystemStatus.tsx` | Widened `onFilterChange` prop type |
| `frontend/src/components/layouts/SidebarLeft.tsx` | Widened `onFilterChange` prop type |

---

## Verification

```
cd frontend && pnpm run lint      → 0 errors, 0 warnings
cd frontend && pnpm run typecheck → no type errors
cd frontend && pnpm run test      → 14 test files, 205 passed (205)
```

---

## Benefits

- **Zero race conditions**: The airspace layer state is now locked to backend cache lifecycle — no stale polygons on mission area shift.
- **Operational precision**: Operators can isolate specific airspace threat categories (e.g., PROHIBITED + RESTRICTED only) without data refetch overhead.
- **Instant filtering**: Client-side zone type masking with no network round-trip.
- **Type safety**: The full `onFilterChange` prop chain now correctly types `string[]` values end-to-end.
