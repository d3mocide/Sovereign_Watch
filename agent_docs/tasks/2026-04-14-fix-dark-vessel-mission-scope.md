## Issue

The dark-vessel layer was rendering large numbers of inland points because the frontend always requested `/api/firms/dark-vessels?hours_back=24` with no bbox. That backend route defaults to a full-world query, so any global FIRMS hotspot with no nearby AIS vessel could be returned as a dark-vessel candidate, including obvious on-land detections.

## Solution

Changed the frontend dark-vessel fetch path to follow the same scope contract as FIRMS hotspots: use the active mission bbox by default, and only request the full-world envelope when the FIRMS global mode is active.

## Changes

- Updated `frontend/src/hooks/useInfraData.ts`
  - Added a small query-param helper so mission bbox params can be reused across FIRMS-derived endpoints.
  - Added `getMissionDarkVesselsUrl()` to build a mission-scoped `/api/firms/dark-vessels` request from the active mission area.
  - Updated dark-vessel fetching so mission mode uses the active mission bbox and global mode uses the explicit world bbox.
  - Rebound the dark-vessel effect to `firmsGlobal` so the request scope updates when the FIRMS global state changes.

## Verification

- `cd frontend && pnpm run lint`
  - Result: passed (`LINT_OK`).
- `cd frontend && pnpm run typecheck`
  - Result: passed (`TYPECHECK_OK`).
- `cd frontend && pnpm run test`
  - Result: passed (`18` test files / `268` tests).

## Benefits

- Dark-vessel candidates no longer default to a world query when the user is operating in mission scope.
- Obvious inland FIRMS detections from unrelated regions stop polluting the operational map by default.
- FIRMS and dark-vessel layers now use a consistent scope model in the frontend.