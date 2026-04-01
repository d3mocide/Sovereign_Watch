# 2026-03-31 - Fix ADS-B Reset on Stream Reconnect

## Issue
Operators observed periodic ADS-B map resets (all aircraft disappearing then repopulating) approximately every 10-15 minutes.

Log evidence showed `/api/tracks/live` WebSocket re-accept events around the reset window, indicating stream reconnect behavior rather than animation interpolation defects.

## Solution
Added frontend stream-connection awareness and stale-prune resilience:

- Detect WebSocket disconnect/reconnect transitions from the worker protocol.
- Surface reconnect diagnostics to Intel stream.
- During disconnection windows, apply a longer stale-grace period so entities are not purged aggressively.

This prevents full-map wipe/re-render when the stream briefly drops or reconnect backoff occurs.

## Changes
- Updated [frontend/src/workers/WorkerProtocol.ts](frontend/src/workers/WorkerProtocol.ts):
  - Added optional `onSocketStateChange` callback in `WorkerProtocolOptions`.
  - Emitted socket state transitions on `onopen`, `onclose`, and max reconnect exhaustion.

- Updated [frontend/src/hooks/useEntityWorker.ts](frontend/src/hooks/useEntityWorker.ts):
  - Added `streamConnectedRef` to shared worker state return.
  - Wired `onSocketStateChange` handler.
  - Emitted Intel stream diagnostics:
    - `TRACK STREAM DISCONNECTED — reconnecting...`
    - `TRACK STREAM RECONNECTED`

- Updated [frontend/src/App.tsx](frontend/src/App.tsx):
  - Used `streamConnectedRef` in maintenance stale pruning.
  - While disconnected, increased stale threshold grace to 15 minutes (`DISCONNECTED_GRACE_MS`) before entity eviction.

## Verification
- Frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Eliminates visible ADS-B full-reset behavior during transient stream reconnects.
- Improves operator trust by making stream health transitions visible.
- Confirms issue is stream continuity-related, not animation loop interpolation instability.
