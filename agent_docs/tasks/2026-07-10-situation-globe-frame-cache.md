# Global Situation Globe — Uncached Per-Frame Layer Rebuild

## Issue

On the dashboard's Global Situation view, the terminator (and the globe in
general) rendered in a broken, jagged state for as long as ~3 minutes after
a fresh page load — self-correcting once the rest of the dashboard finished
loading. Navigating away from the view and back also fixed it, but faster
(~10 seconds). Two prior fixes already landed for terminator *geometry* bugs
(`2026-07-08-gdelt-coldstart-terminator-kinetic-ranker.md`,
`2026-07-10-globe-terminator-chord-fix.md`), but the transient "stuck until
things settle" symptom persisted — this is a third, distinct cause.

Root cause: `SituationGlobe.tsx`'s imperative layer-composition `useEffect`
is keyed on `now`, which is updated 60x/sec by the auto-rotation
`requestAnimationFrame` loop. Every one of those frames rebuilt the entire
layer stack (`buildInfraLayers`, `buildAuroraLayer`, `buildCountryHeatLayer`,
`getTerminatorLayer`, `buildGdeltLayer`, `buildAOTLayers`) from scratch, each
call passing brand-new inline accessor closures. deck.gl treats a changed
accessor reference (`getFillColor`, `getPosition`, …) as a signal that GPU
attribute buffers need regenerating and re-uploading, so this uncached
rebuild forced full attribute regen for every one of those layer groups on
every frame — 60x/sec, indefinitely.

This is inconsistent with the rest of the app: `TacticalMap`/`OrbitalMap`
(via `useAnimationLoop.ts` → `composeAllLayers()` → `layers/composition.ts`)
use a persistent `LayerCache` per overlay specifically to avoid this
(`layerCache.ts`: *"avoids regenerating and re-uploading their GPU attribute
buffers every frame"*). `SituationGlobe` hand-rolls its own layer list
inline and never adopted that pattern.

Under the extra main-thread load of the rest of the dashboard mounting
(concurrent widget fetches/renders on first load), this uncached rebuild
starves the browser's main thread badly enough that MapLibre's own
render/projection events fall behind. `@deck.gl/mapbox` re-evaluates globe
vs. mercator projection on every MapLibre `render` event and falls back to
flat `MapView` math whenever the style/projection hasn't reported `'globe'`
yet — so under sustained starvation the globe keeps getting drawn with flat
projection math, producing the same jagged/misplaced terminator artifact the
geometry fixes addressed, until the main thread frees up and the frame rate
recovers. A cold full page load has much more concurrent work (~3 min to
settle) than a warm remount with already-fetched data (~10 s).

## Solution

Give `SituationGlobe` the same per-overlay `LayerCache` treatment already
used by `useAnimationLoop.ts`. Layer groups whose inputs change on a
second-to-minute cadence (infra, aurora, country heat, terminator, GDELT,
mission/AOT ring) are now memoized via `cache.get(key, deps, build)` and
only rebuilt when their actual dependencies change, instead of on every
animation frame. Satellite interpolation and the orbital layers it feeds
intentionally stay outside the cache — their positions genuinely animate
every frame, matching the existing convention in `composition.ts` where
`getOrbitalLayers` is likewise never cached. Aurora's pulse argument is
throttled to 10 Hz (`pulseNow = now - (now % 100)`) to match the
`pulseNow` convention already used in `composition.ts` for the same reason.

## Changes

- `frontend/src/components/map/SituationGlobe.tsx`
  - Added a persistent `LayerCache` (`layerCacheRef`), one per overlay
    instance, mirroring `useAnimationLoop.ts:360-361`.
  - Wrapped `buildInfraLayers`, `buildAuroraLayer`, `buildCountryHeatLayer`,
    `getTerminatorLayer`, `buildGdeltLayer`, and `buildAOTLayers` in
    `cache.get(...)` calls keyed on their actual inputs.
  - `buildAuroraLayer`'s time argument now uses a 10 Hz-throttled `pulseNow`
    instead of raw `now`.
  - `ixpData`, `facilityData`, `dnsRootData` were used inside the effect but
    missing from its dependency array — added them (they now also serve as
    the infra cache key). Satellite interpolation and `getOrbitalLayers`
    remain uncached, unchanged in behavior.

## Verification

```
cd frontend && pnpm run lint       # clean
              pnpm run typecheck   # clean
              pnpm run test        # 290/290 passed
              pnpm run build       # succeeds
```

No backend/DB stack is running in this sandbox, so the live multi-minute
timing scenario could not be reproduced end-to-end in a browser; the fix was
verified by static analysis confirming the cached layer composition, order,
and props are identical to before, gated only by dependency-equality checks
instead of running unconditionally every frame.

## Benefits

- The Global Situation globe (infra, aurora, country heat, terminator,
  GDELT, mission ring) no longer regenerates and re-uploads GPU attribute
  buffers 60x/sec — only when the underlying data actually changes.
- Removes the main-thread contention most likely responsible for the globe
  getting stuck rendering with flat-map projection math for minutes after a
  cold dashboard load.
- Brings `SituationGlobe` in line with the caching convention already used
  by `TacticalMap`/`OrbitalMap`.
