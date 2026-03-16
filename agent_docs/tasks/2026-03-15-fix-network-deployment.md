# 2026-03-15-fix-network-deployment

## Issue
Running the project on a local network server resulted in CORS blocks and broken WebSocket connections because several URLs were hardcoded to `localhost`. Additionally, accessing the site via HTTP (common for local IP access) caused a crash because `crypto.randomUUID()` is only available in secure contexts (HTTPS or localhost).

## Solution
1.  **CORS**: Centralized `ALLOWED_ORIGINS` in `.env` and updated `docker-compose.yml` to use it for both `backend-api` and `js8call` services.
2.  **WebSockets**: Updated frontend hooks (`useJS8Stations`, `useListenAudio`, and `useEntityWorker`) to dynamically derive the WebSocket URL from `window.location.host` when accessed via a network IP, while still allowing an override via `VITE_*_URL`.
3.  **UUID**: Added a fallback for `crypto.randomUUID()` in `App.tsx` that uses a timestamp-based random string when the native API is unavailable.

## Changes
- [MODIFY] [App.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/App.tsx): Added `crypto.randomUUID()` fallback.
- [MODIFY] [useJS8Stations.ts](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/hooks/useJS8Stations.ts): Dynamic WS URL selection logic.
- [MODIFY] [useListenAudio.ts](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/hooks/useListenAudio.ts): Dynamic WS URL selection logic for audio.
- [MODIFY] [docker-compose.yml](file:///home/zbrain/Projects/Sovereign_Watch/docker-compose.yml): Used environment variables for CORS and frontend URLs.
- [MODIFY] [.env.example](file:///home/zbrain/Projects/Sovereign_Watch/.env.example): Added `ALLOWED_ORIGINS` with instructions.

## Verification
- Manual verification of URL derivation logic (confirmed `window.location.host` is used as fallback).
- Fallback logic for `crypto.randomUUID()` implements a robust unique ID string.
- Backend CORS configuration verified to accept the `${ALLOWED_ORIGINS}` variable.

## Benefits
- Project can now be easily deployed to any server on a local network.
- Configuration is centralized in `.env`.
- Frontend is more resilient to non-secure environments and varying network addresses.
