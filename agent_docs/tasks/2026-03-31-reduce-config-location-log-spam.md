# 2026-03-31 - Reduce Config Location Log Spam

## Issue
During track-stream incident triage, backend logs were dominated by repeated `/api/config/location` requests, making websocket and broadcast events difficult to isolate in real time.

## Solution
Reduced noisy polling behavior from the frontend:

- Switched system heartbeat checks from `/api/config/location` to backend `/health`.
- Increased mission-area polling interval used for external mission sync from 2 seconds to 15 seconds.
- Added mission-area request deduplication with a short TTL cache to collapse concurrent calls into a single fetch.
- Reduced mission sync checks further to a low-frequency cadence and only while the tab is visible.
- Added reload-persistent mission cache to avoid request spikes during rapid remount/reload cycles.

## Changes
- Updated `frontend/src/hooks/useSystemHealth.ts`:
  - Removed `getMissionArea()` dependency for health checks.
  - Added direct `fetch('/health', { cache: 'no-store' })` heartbeat.

- Updated `frontend/src/hooks/useMissionArea.ts`:
  - Changed external mission polling cadence from `2000ms` to default `60000ms`.
  - Added `VITE_MISSION_SYNC_INTERVAL_MS` override for tuning.
  - Polls only when browser tab visibility is `visible`.
  - Kept initial load behavior unchanged.

- Updated `frontend/src/api/missionArea.ts`:
  - Added 5-second mission-area cache.
  - Added 60-second `localStorage`-backed cache hydration for reload resilience.
  - Added in-flight request deduplication so concurrent callers share one backend request.
  - Updated cache on successful mission-area updates.

## Verification
- Frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Dramatically lowers repetitive config-location log volume.
- Keeps logs readable during live incident response.
- Preserves mission synchronization while reducing unnecessary request churn.
