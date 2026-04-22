# 2026-04-22-fix-js8call-auth.md

## Issue
Recent security hardening in the JS8Call bridge server now mandates JWT-based authentication for all WebSocket connections. Connections without a valid `token` query parameter were being rejected with a 401 status or connection closure (code 4001), preventing the radio terminal from functioning.

## Solution
Integrated the existing JWT authentication system into the JS8Call WebSocket initialization flow.

- Updated the `resolveWebSocketUrl` utility to support optional token injection.
- Modified the JS8Call hooks (`useJS8Stations`, `useListenAudio`) to retrieve the current session token and pass it during connection.
- Refactored the Wide Panoramic waterfall connection to use a dynamic URL generator that includes the authentication token.

## Changes
- `frontend/src/utils/network.ts`: Added `token` parameter to `resolveWebSocketUrl` and a helper `appendToken`.
- `frontend/src/components/js8call/kiwi/RadioModeConfig.ts`: Converted `WATERFALL_WS_URL` to `getWaterfallWsUrl` function.
- `frontend/src/hooks/useJS8Stations.ts`: Updated to pass token to the station feed WebSocket.
- `frontend/src/hooks/useListenAudio.ts`: Updated to pass token to the audio stream WebSocket.
- `frontend/src/components/js8call/ListeningPost.tsx`: Updated wide waterfall connection to use authenticated URL.

## Verification
- Verified frontend type-safety with `pnpm run typecheck`.
- Manual verification confirms that WebSocket connections now include the `?token=...` parameter and are accepted by the backend.

## Benefits
- Restores functionality to the JS8Call radio terminal.
- Ensures consistent security policy across all WebSocket endpoints.
- Prevents unauthorized access to sensitive radio telemetry and audio streams.
