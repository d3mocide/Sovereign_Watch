# HTTPS Reverse Proxy WebSocket Fix

## Issue

Frontend build-time `VITE_*` endpoints could force the browser to connect to insecure or internal `http://` and `ws://` origins even when the app was served through HTTPS behind a reverse proxy. That caused mixed-content failures for JS8 and live-track websocket traffic.

## Solution

Added a shared frontend URL resolver that prefers same-origin proxy paths whenever an HTTPS page is given an insecure or localhost/private build-time endpoint. Updated JS8 and TAK websocket/http consumers to use the shared resolver.

## Changes

- Added `frontend/src/utils/network.ts` with shared HTTP and WebSocket URL normalization.
- Updated JS8 websocket consumers to use normalized same-origin-safe URLs.
- Updated Kiwi/WebSDR node HTTP polling to avoid insecure cross-origin targets under HTTPS.
- Updated the TAK worker websocket URL builder to stop trusting insecure `VITE_API_URL` values in reverse-proxied deployments.
- Updated the frontend static nginx config so `index.html` is not cached after deploys, reducing stale bundle/API-route issues behind proxies and CDNs.
- Added explicit deck.gl text character sets for labels that render the middle-dot separator, removing the missing glyph warning.
- Hardened `/api/satnogs/stations` so upstream SatNOGS outages return an empty dataset with diagnostic metadata instead of surfacing a hard browser-facing `502` when no cache is available.

## Verification

- `cd frontend && pnpm run lint` passed.
- `cd frontend && pnpm run typecheck` passed.
- `cd frontend && pnpm run test` passed `(18 files, 268 tests)`.

## Benefits

- HTTPS deployments no longer attempt mixed-content websocket connections when old build-time endpoints point at internal hosts.
- Same-origin reverse proxy routing is preserved by default, which is the correct topology for TLS-terminated deployments.
- One shared resolver reduces repeated URL handling logic and makes future websocket/http clients less error-prone.