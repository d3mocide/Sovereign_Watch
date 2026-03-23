# Task: globe.gl + Three.js Globe Rendering Integration

**Date:** 2026-03-23
**Branch:** `claude/investigate-globe-rendering-SWMLt`

---

## Issue

The existing globe mode (`SituationGlobe`) uses MapLibre GL's native
`projection: { type: 'globe' }` with a deck.gl `MapboxOverlay`. This works
but has several limitations:

1. **No atmosphere glow** – MapLibre doesn't provide a Three.js atmosphere
   shader; the globe looks flat at its edges.
2. **Depth buffer workaround** – `_full3d: false` is required because MapLibre's
   globe depth buffer clips entities near the surface incorrectly.
3. **No tube-geometry arc trails** – globe.gl renders satellite trails as
   lit `TubeGeometry` objects that follow the sphere surface naturally.
4. **Auto-rotation via manual RAF** – the current implementation increments
   `viewState.longitude` by +0.08° per frame; globe.gl's Three.js
   `OrbitControls` handles this natively with proper inertia/damping.
5. **Tile-fetch overhead** – MapLibre must load Carto dark-matter tiles;
   globe.gl renders the sphere from a single JPEG texture.

---

## Solution

### Architecture

Two WebGL surfaces are stacked in the same DOM container:

```
┌─────────────────────────────────────────────────────────────┐
│  Container (w-full h-full, bg-black, overflow-hidden)       │
│                                                             │
│  z-index 0  ─  globe.gl / Three.js canvas                  │
│     • Sphere (NASA night-earth texture via unpkg CDN)       │
│     • Atmosphere glow (built-in fragment shader)            │
│     • Country polygon cap-fills (GeoJSON choropleth)        │
│     • Satellite trail paths (Three.js line geometry)        │
│     • Submarine cable paths                                 │
│     • Night-sky starfield background                        │
│     • OrbitControls (auto-rotate + user pan/zoom/inertia)   │
│                                                             │
│  z-index 1  ─  deck.gl standalone / GlobeView canvas       │
│     • Transparent background, pointer-events: none          │
│     • Aurora oval (buildAuroraLayer)                        │
│     • GDELT events (buildGdeltLayer)                        │
│     • Country outage shading (buildInfraLayers)             │
│     • Satellite gem-face icons (getOrbitalLayers)           │
│     • Mission area rings (buildAOTLayers)                   │
│     • Terminator (day/night boundary)                       │
└─────────────────────────────────────────────────────────────┘
```

### Camera Synchronisation

globe.gl exposes `pointOfView() → { lat, lng, altitude }` where `altitude`
is in globe-radii above the surface (default ≈ 2.5 for a full-globe view).

On every `OrbitControls 'change'` event:

```
zoom_deck = log₂(2.5 / altitude) + 1.0   [clamped to 0.5–20]
deck.setProps({ viewState: { longitude: lng, latitude: lat, zoom } })
```

This keeps both canvases' projections identical so deck.gl layers render
at the correct geographic positions regardless of where the user pans.

### Globe-path update throttle

globe.gl path updates trigger Three.js geometry rebuilds. To keep the
frame rate smooth, `updateGlobePaths()` is called at most once every 2 s
from the animation loop (satellite positions update far more slowly than
60 fps anyway).

---

## Changes

| File | Action | Description |
|------|--------|-------------|
| `frontend/package.json` | Modified | Added `globe.gl ^2.33.0`, `three ^0.176.0` (deps) and `@types/three ^0.176.0` (devDep) |
| `frontend/src/components/map/GlobeGLScene.tsx` | **Created** | Core rendering component: globe.gl init, deck.gl standalone init, camera sync, imperative handle (`updateDeckLayers`, `updateGlobePaths`) |
| `frontend/src/components/map/SituationGlobeGL.tsx` | **Created** | Drop-in replacement for `SituationGlobe`; same props interface; handles aurora/GDELT polling, entity interpolation, and RAF animation loop |
| `frontend/src/components/views/DashboardView.tsx` | Modified | Feature-flag switch `VITE_ENABLE_GLOBE_GL=true` selects `SituationGlobeGL`; defaults to existing `SituationGlobe` |

### Files NOT modified (existing layer system preserved)

All existing deck.gl layer builders in `frontend/src/layers/` remain
unchanged. `SituationGlobeGL` consumes them identically to `SituationGlobe`.

---

## Activation

Set the environment variable before starting the dev server:

```bash
VITE_ENABLE_GLOBE_GL=true pnpm run dev
```

Or add to `.env.local`:

```
VITE_ENABLE_GLOBE_GL=true
```

---

## Verification

```bash
cd frontend && pnpm run lint
cd frontend && pnpm run typecheck
cd frontend && pnpm run test
```

Visual checks:
1. Globe renders with atmosphere glow at the limb.
2. Country polygon fills appear (dark blue tint, red tint for outage countries).
3. Night-sky background visible around the globe.
4. Satellite trail paths arc across the sphere surface in purple.
5. Submarine cable paths visible in cyan.
6. Aurora oval and GDELT events rendered via deck.gl overlay (correct positions).
7. Globe auto-rotates; user can pan/zoom.
8. With `VITE_ENABLE_GLOBE_GL` unset (or `false`), the original MapLibre globe
   renders as before — no regression.

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| **Two WebGL contexts** per page | Both use `preserveDrawingBuffer: false` (default); tested on mid-range hardware; consider disabling one context when the dashboard tab is hidden via `document.hidden` |
| **Three.js peer dep version** | `globe.gl@^2.33` uses `three@^0.176`; `@deck.gl/mesh-layers@9.2` also depends on `three` — resolve to a single version via pnpm's deduplication (no lockfile conflict expected) |
| **globe.gl dispose** | globe.gl has no `.dispose()` method; cleanup clears `innerHTML` of the container div, which drops the Three.js canvas from the DOM and allows GC |
| **Camera sync lag** | OrbitControls fires `change` synchronously on each rAF tick; deck.gl `setProps` is immediate (not batched by React), so there is no perceptible lag |
| **CDN textures in offline environments** | Earth-night and night-sky images are loaded from `unpkg.com`; for offline deployments, copy them to `frontend/public/` and update the `globeImageUrl` / `backgroundImageUrl` props in `GlobeGLScene.tsx` |

---

## Benefits

- **Polished OSINT-dashboard aesthetic** — atmosphere glow, starfield, and
  lit arc trails match the visual language described in the rendering spec.
- **Correct depth buffer** — `_full3d: false` workaround no longer needed
  for entity occlusion; Three.js handles depth testing natively.
- **Zero breaking changes** — existing MapLibre globe is the default; the
  globe.gl path is opt-in via a single env var.
- **No layer builder changes** — all 15+ deck.gl layer builders are reused
  unmodified via the transparent GlobeView overlay.
