# 2026-03-31 - Fix Track Stream Drop (Reconnect + Auth Recovery)

## Issue
Operators observed full track stream dropouts where `/api/tracks/live` disconnected and frontend tracking counts decayed to zero without automatic recovery.

Symptoms included Intel feed messages such as stream disconnect/reconnect cycles and eventual dead-stream behavior after retry exhaustion.

## Solution
Hardened frontend websocket recovery and token retrieval:

- Remove fixed reconnect-attempt cap so reconnect continues indefinitely with capped exponential backoff.
- Correctly read websocket close code from `CloseEvent` (instead of reading from socket object) to classify auth failures.
- Recover JWT token from `sessionStorage` when in-memory token state is empty (for example after module-state resets), so websocket reconnects continue to include auth token.
- Improve Intel feed messaging for auth-failure disconnects.

## Changes
- Updated `frontend/src/api/auth.ts`:
  - `getToken()` now falls back to `sessionStorage.getItem('sw_token')` when in-memory token is null.
  - Restores `_token` from session storage for subsequent requests/reconnects.

- Updated `frontend/src/workers/WorkerProtocol.ts`:
  - Changed `ws.onclose` to accept `CloseEvent` and use `event.code`.
  - Added `auth_failed` reason classification for close code `4001`.
  - Removed finite `maxReconnectAttempts` stop condition.
  - Reconnect now persists indefinitely with capped backoff (max 30s).

- Updated `frontend/src/hooks/useEntityWorker.ts`:
  - Intel stream now reports auth-related disconnects as:
    - `TRACK STREAM AUTH FAILED — re-authenticating...`

## Verification
- Frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Prevents permanent dead-stream state after transient outages or auth-state desync.
- Improves resilience during backend restarts and network interruptions.
- Provides clearer operator diagnostics when stream auth is the underlying issue.
