# 2026-03-14 KiwiSDR Connection & Redirect Fix

## Issue
After a recent refactor, the KiwiSDR client was unable to connect to many remote nodes.
- The default node (`kiwisdr.wb7awl.us`) was detected as down.
- Proxied nodes (e.g., `21113.proxy.kiwisdr.com`) return HTTP redirects (301/302/307) which the `websockets` library failed to handle, resulting in "invalid HTTP response" errors.
- Some secure proxies require an `Origin` header.

## Solution
Updated the native `KiwiClient` to proactively handle HTTP redirects and provide necessary headers.
- Implemented a redirect-following loop in `KiwiClient.connect` and `_start_waterfall` using `aiohttp` to check for 3xx status codes before establishing the WebSocket.
- Added `Origin` and `User-Agent` headers to the WebSocket handshake.
- Increased `CONNECT_TIMEOUT` to 15 seconds to accommodate multi-hop redirection.

## Changes
- **js8call/kiwi_client.py**: Added `aiohttp` dependency for pre-handshake redirect checks. Implemented redirect loop with `MAX_REDIRECTS=3`. Added handshake headers. Improved waterfall connection flow with similar redirect support.

## Verification
- Succesfully verified connection to `21113.proxy.kiwisdr.com` which redirected to `21113.proxy2.kiwisdr.com/snd`.
- Verified continued connectivity to direct nodes (e.g., `kk6pr.ddns.net`).
- Verified retuning functionality over live WebSocket.

## Benefits
- Restores functionality for the majority of public KiwiSDR nodes.
- Improves robustness against infrastructure changes in the KiwiSDR proxy network.
- Maintains low-latency frequency switching.
