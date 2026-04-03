# 2026-04-03 - Add 5-Minute Maritime Track Cache on Refresh

## Issue
When AIS upstream temporarily provides no frames, browser refresh clears in-memory maritime tracks and the map appears empty even though recent tracks were visible moments earlier.

## Solution
Added a client-side maritime snapshot cache with 5-minute TTL. Recent sea tracks are restored on load/refresh to bridge temporary AIS no-data windows.

## Changes
- Updated `frontend/src/hooks/useEntityWorker.ts`:
  - Added maritime cache constants and helpers.
  - Persisted sea entities (trimmed snapshot) to `localStorage` every 10s and on teardown.
  - Restored cached sea entities on mount when snapshot age is <= 5 minutes.
  - Hydrated `knownUidsRef` for restored entities to avoid duplicate "new entity" event behavior.
  - Emitted a compact Intel event when cache restore occurs.

## Verification
- Frontend validation:
  - `cd frontend && pnpm run lint && pnpm run test`

## Benefits
- Prevents perceived maritime stream "wipe" after page refresh during transient AIS droughts.
- Keeps tactical context visible while poller reconnect/backoff resolves upstream no-data periods.
- Preserves existing live stream update behavior once fresh AIS frames resume.
