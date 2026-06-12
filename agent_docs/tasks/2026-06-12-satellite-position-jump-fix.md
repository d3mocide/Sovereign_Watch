# Satellite Position Jump Fix — Epoch-Anchored Dead Reckoning

## Issue

Satellites in globe view loaded, drifted slowly along their orbits, then
periodically **all surged across the globe at once** and settled in new
positions. Reported as a follow-up to the frontend performance task.

Root cause analysis (full pipeline traced: `space_pulse` SGP4 sweep →
Kafka → broadcast WS → TAK worker → `useEntityWorker` → `interpolatePVB`):

1. **Receive-time anchoring.** Each satellite message carries `time` (the
   SGP4 propagation epoch, ms), but `useEntityWorker` stamped
   `serverTime: Date.now()` — the *receive* time. The 15 s sweep is published
   in throttled chunks and flows through Kafka/WS, so positions are 1–10 s
   old on arrival; satellites rendered persistently behind their true
   positions and each new sweep "corrected" them forward.
2. **Wall-clock targets + exponential chase.** `interpolatePVB` eases the
   visual toward a target that advances in wall-clock time — even while no
   frames render. During the initial-load main-thread stall (the layer
   rebuild problem fixed in the same PR), targets marched on; when the frame
   rate recovered, every visual closed its accumulated gap at ~70 %/frame —
   the synchronized constellation-wide surge.
3. Minor: first-update `expectedInterval` was seeded at 5 s vs the real 15 s
   sweep cadence, and satellites had no out-of-order message rejection.

## Solution

1. **Epoch-anchored DR** — `DRState` now has two time anchors:
   - `serverTime` = the position's source epoch (`entity.time`, guarded by
     `drAnchorTime()` against clock skew / wrong units: values outside
     `(now − 120 s, now]` fall back to receive time);
   - `blendTime` = receive time, used for blend progress (alpha) and the
     client continuation projection.
   The server projection runs from the epoch, so stale-on-arrival positions
   are extrapolated to "now" immediately. New satellites (no prior visual)
   seed `blendTime = serverTime`, so they *appear* at their true current
   position rather than easing forward from the stale one.
2. **Teleport guard** in `interpolatePVB`: if the visual→target gap exceeds
   `max(2°, speed × expectedInterval × 3)` the visual snaps in one frame
   instead of racing across the map. The longitude delta is deliberately
   unwrapped so antimeridian crossings snap to the far side rather than
   smoothing the long way around the globe.
3. **Frame-stall reset** in `useAnimationLoop`: if the raw inter-frame gap
   exceeds 1 s (hidden tab, GC, shader compilation), `visualState` is
   cleared so the next frame re-seeds every visual directly at its target —
   one clean snap instead of a global catch-up surge.
4. Satellites now reject out-of-order/duplicate sweeps
   (`lastSourceTime >= entity.time`, same guard the aircraft/ship path had)
   and seed `expectedInterval` at the real 15 s sweep cadence.

## Changes

- `frontend/src/types.ts` — `DRState.blendTime` added; `serverTime`
  documented as the position epoch.
- `frontend/src/utils/interpolation.ts` — dual-anchor projection
  (`serverTime` for server projection, `blendTime` for alpha + client
  projection); teleport guard with speed-scaled threshold.
- `frontend/src/hooks/useEntityWorker.ts` — `drAnchorTime()` helper; both
  the satellite and aircraft/ship branches anchor to `entity.time`;
  satellite branch gains out-of-order rejection + `lastSourceTime`; new
  entities seed `blendTime = serverTime`.
- `frontend/src/hooks/useAnimationLoop.ts` — clear `visualState` after a
  > 1 s frame gap.
- `frontend/src/utils/interpolation.test.ts` — fixture updated for
  `blendTime`; 6 new tests covering epoch anchoring (immediate placement,
  epoch-vs-receive projection) and the teleport guard (snap above
  threshold, smooth below, speed-scaled threshold, antimeridian snap).

## Verification

- `pnpm run lint` — clean (0 warnings).
- `pnpm run typecheck` — clean (the new required `DRState.blendTime` field
  forced review of every construction site).
- `pnpm run test` — 278/278 passed (272 existing + 6 new).
- `pnpm run build` — production build succeeds.

## Benefits

- Satellites appear at their true current position immediately and then
  follow their path smoothly — no more constellation-wide fast-forward
  after load, tab switches, or main-thread stalls.
- Pipeline latency no longer translates into persistent display lag for any
  entity type (aircraft/ships benefit from the same epoch anchoring).
- Out-of-order satellite sweeps can no longer drag positions backwards.
