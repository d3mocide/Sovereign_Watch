# Frontend COT Rendering Optimization + JS8Call/KiwiSDR Bridge Fixes

## Issue

1. **Rendering**: The tactical map needed to stay smooth with thousands of live
   COTs. The rAF loop ran uncapped (120/144 Hz on fast displays), recomposed
   every deck.gl layer each tick, and `buildEntityLayers`/`buildTrailLayers`
   made 5-6 separate `filter`/`map` passes per frame — each allocating
   intermediate arrays, plus a fresh path array per trail per frame.
2. **Pipeline**: `useEntityWorker` serialized every maritime entity (with
   trails) to `localStorage` inline on the WebSocket message path every 10 s —
   a multi-ms main-thread hitch at AIS scale, with no size cap (quota risk).
   The TAK worker flushed decode batches every 10 messages, causing excessive
   worker→main wakeups during the ~11k-message orbital sweeps.
3. **JS8Call terminal never worked**: the bridge had the UDP API model
   inverted. JS8Call (WSJT-X model) binds an ephemeral port and *pushes*
   events to the configured "UDP Server" (127.0.0.1:2242 per our INI); the
   bridge instead listened on 2245 (where nothing ever arrives — the INI's
   `UDPClient2*` keys are not real JS8Call settings) and sent commands to a
   fixed port 2242 (where nothing listens). Additionally, every outgoing
   datagram used uppercase JSON keys (`{"TYPE": ...}`) while the JS8Call API
   requires lowercase (`{"type", "value", "params"}`), `RIG.SET_FREQ` lacked
   the required `params.DIAL`, and `MODE.SET_SPEED` sent a string instead of
   the numeric submode.
4. **KiwiSDR password nodes never connected**: `kiwi_client.py` sent
   `SET auth t=kiwi pwd=<md5>`, which is not part of the KiwiSDR protocol.
   The reference kiwiclient sends plaintext `SET auth t=kiwi p=<password>`.
   The waterfall stream also always authenticated with an empty password.

## Solution

- Adaptive frame pacing in the animation loop: ~30 fps when
  `entities + satellites > 800`, ~60 fps cap otherwise (skips redundant
  120/144 Hz ticks). dt accumulates across skipped ticks so interpolation is
  unaffected.
- Single-pass dataset derivation in `buildEntityLayers` (integrity halos,
  altitude stems, tactical halos, selection ring, velocity vectors) and
  `buildTrailLayers` (trails + gap bridges), plus a `WeakMap` cache for
  smoothed-trail → path3D conversion keyed on the (update-stable) trail array.
- Maritime snapshot: capped at 750 most-recent entities, interval 10 s → 30 s,
  serialization moved to `requestIdleCallback`.
- TAK worker batch size 10 → 64 (flush interval unchanged at 50 ms).
- JS8 bridge: binds UDP 2242, records JS8Call's datagram source address as the
  command reply address, sends correctly-shaped lowercase-key API messages,
  handles `PING`/`STATION.CALLSIGN`/`STATION.GRID`/`RIG.FREQ`/`MODE.SPEED`
  responses into a merged `STATION.STATUS` broadcast, reports
  `js8call_connected` from actual datagram liveness (60 s window), and pulls
  initial station state on first contact. Removed the bogus `UDPClient2*` INI
  keys; compose/Dockerfile env updated (`JS8CALL_PORT` → `JS8CALL_UDP_SERVER_PORT`).
- KiwiSDR auth: plaintext `p=<password>` per reference kiwiclient, applied to
  both SND and W/F streams.

## Changes

- `frontend/src/hooks/useAnimationLoop.ts` — adaptive frame pacing; rAF
  scheduled at tick start so paced skips keep the loop alive.
- `frontend/src/layers/buildEntityLayers.ts` — one pass over interpolated
  entities builds all five per-layer datasets.
- `frontend/src/layers/buildTrailLayers.ts` — merged trail/gap-bridge pass;
  `WeakMap` path3D cache.
- `frontend/src/hooks/useEntityWorker.ts` — sea snapshot cap + idle-time write.
- `frontend/src/workers/tak.worker.ts` — batch size 64.
- `js8call/server.py` — UDP server model fixed (bind 2242, reply-address
  routing), JS8Call API message shapes fixed, station-state merge + liveness.
- `js8call/kiwi_client.py` — plaintext password auth on SND and W/F streams.
- `js8call/Dockerfile` — INI cleanup, env var rename.
- `js8call/tests/test_kiwi_compatibility.py` — auth tests updated to the
  protocol-correct plaintext form.
- `docker-compose.yml` — `JS8CALL_PORT` (unused) → `JS8CALL_UDP_SERVER_PORT`.

## Verification

- `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test` —
  clean; 278/278 tests pass.
- `cd js8call && uv tool run ruff check . && uv run python -m pytest` — clean;
  26/26 tests pass (two tests asserting the incorrect MD5 auth form were
  updated to assert the reference-kiwiclient plaintext form).
- JS8Call/KiwiSDR runtime paths require a container rebuild
  (`docker compose up -d --build sovereign-js8call`) and a live JS8Call/KiwiSDR
  to exercise end-to-end; protocol behavior was verified against the reference
  kiwiclient implementation and the JS8Call/WSJT-X UDP API model.

## Benefits

- Entity/trail layer construction does ~5x fewer array allocations per frame
  and the whole pipeline does bounded work per second regardless of display
  refresh rate — steadier frame times with thousands of COTs, less GC churn.
- No more periodic main-thread stalls from maritime cache serialization; the
  cache can no longer blow the localStorage quota.
- The JS8 terminal can actually exchange traffic with JS8Call (RX spots,
  directed messages, TX, freq/speed control), and password-protected KiwiSDR
  nodes can authenticate.
