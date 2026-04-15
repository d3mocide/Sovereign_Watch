## Issue

The FIRMS `GLOBAL` subfilter in the frontend could appear disabled while the map still showed world-wide hotspot data. The cause was the mission-mode request path in `useInfraData`: when `firmsGlobal` was false it called `/api/firms/hotspots?hours_back=24` with no bbox, and that backend route defaults to a full-world query.

## Solution

Changed mission-mode FIRMS requests to resolve the active mission area and send an explicit mission bbox. Global mode still uses the full-world bbox request, so the subfilter now correctly switches between mission-scoped and global FIRMS data.

## Changes

- Updated `frontend/src/hooks/useInfraData.ts`
  - Added mission-area lookup via `getMissionArea()`.
  - Added a local FIRMS mission bbox builder using the active mission radius and latitude-adjusted longitude span.
  - Changed non-global FIRMS fetches to call `/api/firms/hotspots` with explicit mission bbox params instead of relying on backend world defaults.
  - Added env-based fallback mission values if mission lookup is temporarily unavailable.

## Verification

- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run typecheck`
- `cd frontend && pnpm run test`
  - Result: passed (`18` files, `268` tests).

## Benefits

- The FIRMS `GLOBAL` subfilter now changes the actual data scope rather than only the visual chip state.
- Mission-mode FIRMS behavior is explicit and no longer depends on backend default bbox semantics.
- The frontend request path is now aligned with how users expect the FIRMS scope control to behave.