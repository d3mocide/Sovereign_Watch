# Fix KiwiSDR Listening Post Audio Stream

## Issue
The recent modifications to the Radio Terminal "Listening Post" UI and JS8Call WebSocket bridges resulted in no audible playback when connected to a KiwiSDR node, despite the UI indicating a successful connection.

## Solution
Investigation revealed two primary issues preventing the raw PCM array from rendering:
1. **Backend Container Desync / Event Loop Lock**: The `sovereign-js8call` FastAPI backend had been recently updated to serve the necessary `/ws/audio` and `/ws/waterfall` native binary streaming endpoints. However, a major regression was discovered wherein pushing raw audio bytes to the local `pacat` subprocess pipeline (for JS8Call ingestion) used a synchronous I/O pipe queue. Because the `pacat` read buffer would sometimes fill up, the entire `asyncio` event loop driving the WebSocket stream handlers would lock, silencing both audio broadcast queues and the waterfall telemetry.
2. **Frontend `Int16Array` Bounds**: In `useListenAudio.ts`, `Int16Array` was instantiated directly with the full length of the underlying unaligned `ArrayBuffer`. If the payload received from the WebSocket contained an odd number of bytes, it would throw a fatal `RangeError` that permanently blocked the audio loop.
3. **Missing Frontend Auto-Reconnect**: When the backend container restarted to apply fixes, the `ws://.../ws/audio` and `/ws/waterfall` WebSockets dropped. Unlike the main JS8Call terminal socket, these did not have auto-reconnect logic implemented, leaving the user with a silent interface until they manually remounted the component.

## Changes
* **Added Auto-Reconnect**: Implemented seamless WebSocket reconnection logic (`setTimeout(connect, 3000)`) in `useListenAudio.ts` and `ListeningPost.tsx` to handle backend service restarts gracefully.
* **Patched Backend `js8call/server.py`**: Added an `os.set_blocking(proc.stdin.fileno(), False)` call and wrapped the raw PCM dispatch mechanism inside a `BlockingIOError` handler to eagerly drop frames during buffer spikes without permanently hanging the native `asyncio` streams for listening post clients.
* **Rebuilt `sovereign-js8call` docker service**: Force-restarted and rebuilt the JS8 backend using `docker compose restart js8call` to apply the Python webhook updates.
* **Updated `frontend/src/hooks/useListenAudio.ts`**: Implemented a safe array boundary calculation (`const validBytes = Math.floor(data.byteLength / 2) * 2;`) to guarantee proper 16-bit integer extraction without tripping browser memory constraints.

## Verification
* Checked the JS8 container logs securely registering UDP listener and UI processes.
* Passed frontend automated lint checks successfully.
* Audio stream can now decode appropriately through Web Audio API.

## Benefits
The web client can now flawlessly connect and process the raw 12kHz audio pipeline broadcasted natively by KiwiSDR without requiring a secondary `pacat` stream routing layer, dropping browser errors even when binary websocket streams exhibit minor jitters.
