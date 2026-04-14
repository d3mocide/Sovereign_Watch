## Issue
Airspace zones could remain invisible when users toggled `AIRSPACE ZONES` on after initial load. The layer visibility changed, but data hydration did not always happen immediately.

## Solution
Added a reactive effect in `TacticalMap` that immediately calls `fetchAirspaceZones()` whenever `showAirspaceZones` changes, so toggling the layer on fetches data right away.

## Changes
- Updated `frontend/src/components/map/TacticalMap.tsx`
  - Added `useEffect` tied to `filters?.showAirspaceZones` to invoke `fetchAirspaceZones()`.
  - Keeps existing websocket-driven and periodic fallback refresh behavior intact.

## Verification
- Ran: `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
- Result:
  - Lint: pass
  - Typecheck: pass
  - Tests: pass (`18 files`, `268 tests`)

## Benefits
- Airspace polygons render immediately when the layer is toggled on.
- Eliminates user-visible “layer on but empty map” behavior caused by delayed hydration.
- Preserves existing refresh architecture (WS signal primary, interval fallback).
