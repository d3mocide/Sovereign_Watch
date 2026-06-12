# Frontend Performance Optimization — Rendering Pipeline & Initial Load

## Issue

The 3D globe views were saturating browser main threads, and initial page load
shipped the entire application in one bundle:

1. **Per-frame layer rebuilding.** The `useAnimationLoop` rAF loop calls
   `composeAllLayers()` at 60 fps, constructing ~40–50 new deck.gl `Layer`
   instances every frame — including static groups (cables, towers, airspace,
   NWS alerts, GDELT, clusters, …) whose source data only changes every
   30 s–15 min. Several builders also created **new `data` arrays per frame**
   (e.g. `historySegments.filter(...)`), which forces deck.gl to regenerate
   and re-upload GPU attribute buffers on every frame.
2. **Terminator recompute.** `getTerminatorLayer()` recomputed a 360-point
   night-side polygon and allocated a fresh GeoJSON object on every call
   (60×/sec from the rAF loop, plus SituationGlobe's update effect) — a new
   `data` reference each frame, so deck.gl re-uploaded it continuously.
3. **Pulse animations at 60 Hz.** Pulsing layers (aurora, jamming, FIRMS,
   dark vessels, holding patterns, kiwi node) threaded raw `Date.now()`
   through `updateTriggers`, recomputing color attributes every frame.
4. **Monolithic bundle.** `vite.config.ts` had no chunking strategy; App.tsx
   eagerly imported TacticalMap/OrbitalMap/IntelGlobe/DashboardView/
   RadioTerminal, so deck.gl (~1 MB), maplibre (~1 MB), mapbox (~1.7 MB) and
   their CSS all landed in the initial load. Both map libraries' CSS was
   imported unconditionally. Google Fonts were also loaded via a
   render-blocking `@import` inside the bundled CSS.

## Solution

**Rendering**
- New `frontend/src/layers/layerCache.ts` — a small `LayerCache` keyed
  memoizer (`Object.is` over a deps array, same contract as React hooks).
  `composeAllLayers()` now wraps every *static* layer group in
  `cache.get(key, deps, build)`, so unchanged groups return the **identical
  Layer instances** frame-to-frame and deck.gl skips diffing/attribute work
  for them entirely. Dynamic groups (entities, satellites, trails) still
  rebuild per frame — their positions genuinely change every frame.
- Each `useAnimationLoop` instance owns its own `LayerCache` (deck.gl Layer
  objects hold per-overlay internal state and must not be shared).
- Pulse animations are quantized to a 10 Hz tick (`now - (now % 100)`):
  visually identical shimmer, but pulsing groups are now cache hits for ~6
  consecutive frames instead of recomputing at 60 fps.
- `TerminatorLayer` memoizes the computed polygon per minute, giving all
  callers a stable `data` reference.
- `StarField` varies `ctx.globalAlpha` instead of formatting a new
  `rgba(...)` string per star per frame (~320 string allocations/frame).
- `interpolation.ts` hoists the spherical-math constants
  (`R_EARTH`, `DEG_PER_RAD`, `RAD_PER_DEG`) out of the per-entity hot path.

**Loading**
- `vite.config.ts`: function-form `manualChunks` splitting `deck-gl`
  (+luma/loaders/math.gl), `maplibre`, `mapbox`, `echarts`(+zrender), and
  `react-vendor` into their own cacheable chunks. Vite's virtual
  preload-helper is isolated into its own chunk — otherwise Rollup parks it
  inside a vendor chunk and the entry transitively preloads that vendor
  (this is also why the object form of `manualChunks` was not used).
- `App.tsx`: TacticalMap, OrbitalMap, IntelGlobe, DashboardView and
  RadioTerminal are now `lazy()`-loaded through a `lazyView()` helper that
  bakes in a Suspense boundary, so the view-switch JSX needed no changes.
- Map library CSS moved into the adapters: `MapboxAdapter` imports only
  `mapbox-gl.css`, `MapLibreAdapter` only `maplibre-gl.css` — the unused
  library's CSS is never downloaded.
- Google Fonts consolidated into a single `index.html` `<link>` (resolves in
  parallel via preconnect); removed the render-blocking `@import` from
  `src/index.css`.

## Changes

- `frontend/src/layers/layerCache.ts` — **new**: keyed frame-to-frame layer memoizer.
- `frontend/src/layers/composition.ts` — all static layer groups wrapped in
  `LayerCache.get()`; pulse `now` quantized to 10 Hz; history-track data
  arrays no longer re-filtered per frame.
- `frontend/src/hooks/useAnimationLoop.ts` — owns a per-overlay `LayerCache`,
  passes it to `composeAllLayers`.
- `frontend/src/components/map/TerminatorLayer.tsx` — terminator GeoJSON
  memoized per minute (stable data reference).
- `frontend/src/components/map/StarField.tsx` — globalAlpha instead of
  per-star rgba string formatting.
- `frontend/src/utils/interpolation.ts` — hoisted trig constants.
- `frontend/src/App.tsx` — `lazyView()` helper; 5 heavy views code-split.
- `frontend/src/components/map/{TacticalMap,OrbitalMap,IntelGlobe}.tsx` —
  removed unconditional map-library CSS imports.
- `frontend/src/components/map/{MapboxAdapter,MapLibreAdapter}.tsx` — each
  imports only its own library's CSS.
- `frontend/vite.config.ts` — manualChunks vendor splitting + preload-helper
  isolation; `chunkSizeWarningLimit: 1600`.
- `frontend/index.html` / `frontend/src/index.css` — font loading
  consolidated, render-blocking `@import` removed.

## Verification

- `pnpm run lint` — clean (0 warnings).
- `pnpm run typecheck` — clean.
- `pnpm run test` — 272/272 passed (20 files).
- `pnpm run build` — verified the chunk graph in `dist/`:
  - Entry modulepreloads only `preload-helper` (~1 kB) + `react-vendor`
    (192 kB / 60 kB gzip).
  - `deck-gl` (1.03 MB), `maplibre` (1.07 MB), `mapbox` (1.72 MB),
    `echarts` (1.14 MB) are separate chunks fetched only when the views
    that need them mount; mapbox vs maplibre loads only the selected adapter
    (CSS included: `mapbox-*.css` 41 kB vs `maplibre-*.css` 70 kB now split).

## Benefits

- **Frame time**: per-frame work in the rAF loop drops from rebuilding
  ~40–50 layers (plus terminator geometry + several full GPU attribute
  re-uploads) to rebuilding only the genuinely dynamic entity/satellite/trail
  layers — static groups are reference-equal cache hits deck.gl skips
  outright. Pulse-animated groups recompute at 10 Hz instead of 60 Hz.
- **Initial load**: eager JS shrinks from ~5–6 MB of vendor code to ~200 kB
  preloaded (entry + react-vendor); the login screen renders without
  downloading any map/chart engine. Vendor chunks are stable across app
  releases, so returning clients hit the HTTP cache.
- **Latency**: fonts no longer render-block behind the CSS bundle; only one
  map engine (and its CSS) is ever downloaded per session.

## Follow-ups (not in this change)

- `public/world-countries.json` is 14 MB of uncompressed GeoJSON fetched at
  runtime; simplifying geometry (e.g. mapshaper at ~1–5 % retention) or
  serving TopoJSON would cut multi-second map start times on slow links.
- Entity interpolation (`processEntityFrame`) is still O(n) on the main
  thread per frame; offloading to the existing TAK worker is the next big
  rendering win if entity counts grow past ~5k.
