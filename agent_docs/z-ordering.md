# Sovereign Watch — Layer Depth & Z-Ordering Reference

**Last Updated:** 2026-04-12 (Global 7-Tier Synchronization)
**Applies To:** `composition.ts`, all `build*Layers.ts` files, `OrbitalLayer.tsx`

---

## Architecture Overview

`MapboxOverlay` is always initialized with **`interleaved: false`**, giving deck.gl its own
dedicated WebGL canvas composited over the MapLibre/Mapbox canvas. This means:

- deck.gl layers share **their own** depth buffer — separate from MapLibre's tile depth buffer
  in most configurations.
- **Exception — `MapboxAdapter` uses `_full3d: true`**: When a Mapbox token is present and the
  map is in Mercator mode, deck.gl reads the Mapbox GL tile depth buffer for occlusion. This is
  the default production path for 2D Mercator.
- **Globe mode always uses `MapLibreAdapter`** (no `_full3d`). MapLibre renders the globe sphere
  in its own context; deck.gl renders on top in its own canvas.

```
Globe mode:   MapLibreAdapter  → interleaved:false, no _full3d
Merc + token: MapboxAdapter    → interleaved:false, _full3d:true  ← shares Mapbox depth buffer
Merc no token: MapLibreAdapter → interleaved:false, no _full3d
```

---

## The Two Depth Testing Rules (Read This First)

### Rule 1 — ScatterplotLayer / PathLayer at z=0 in Mercator: `depthTest: false`

Any layer whose `getPosition` returns `[lon, lat, 0]` (flat geometry on the map surface) **must**
use `depthTest: false` in Mercator mode. In `_full3d` Mapbox mode, these fragments share depth
values with tile geometry and can be silently discarded if depth testing is enabled without a
precisely-tuned bias. Draw order in the `layers` array is the only reliable ordering mechanism
for z=0 Mercator geometry.

```ts
// CORRECT — matches ground-shadows, RF sites, AOT boundaries, JS8 stations
parameters: { depthTest: !!globeMode, depthBias: globeMode ? -N : 0 }
```

```ts
// WRONG — caused RF layer regression in v0.28.5 (5cfc953)
parameters: { depthTest: true, depthBias: -100.0 }  // breaks Mercator ScatterplotLayer at z=0
```

**Layers that correctly use this pattern:** `ground-shadows`, `rf-dots`, `rf-clusters`,
`rf-halo`, `aot-maritime`, `aot-aviation`, `aot-orbital-horizon`, `aot-rf-horizon`,
`js8-stations`, `js8-bearing-lines`, `entity-glow`, `selection-ring`.

### Rule 2 — Billboards and 3D geometry: `depthTest: true` in both modes

`IconLayer` icons, altitude-aware `PathLayer`s, and `TextLayer` with `billboard: true` render
above the tile surface and can safely use `depthTest: true` in both Mercator and Globe.

```ts
// CORRECT for IconLayer, billboard TextLayer, PathLayer with z > 0
parameters: { depthTest: true, depthBias: -N }
```

**Layers that use this pattern:** `heading-arrows-merc`, `entity-tactical-halo`,
`velocity-vectors`, `all-history-trails`, `rf-labels`, `js8-labels` (TextLayer billboard).

---

## `depthBias` Convention

**More negative = closer to the viewer = renders in front of less-negative layers.**

In Globe mode, `depthBias` is passed as `polygonOffsetUnits` to WebGL. A bias of `-200` pushes
the fragment's effective depth toward the near plane by `200 × r_min` (where `r_min ≈ 6×10⁻⁸`
for a 24-bit depth buffer). This ensures the layer wins the LEQUAL depth test against anything
with a less-negative bias.

Positive `depthBias` (used only on satellite footprint/track, `+50`/`+60`) deliberately pushes
those layers behind all other deck.gl geometry.

In Mercator mode, `depthBias` on `depthTest: false` layers has **no effect** and should be set
to `0`.

---

## Draw Order and Depth Matrix (7-Tier System)

Layers are appended to the `layers` array in `composition.ts` in this order. Within the same tier, draw order is the tiebreaker for `depthTest: false` layers.

| Tier | Slot | Layer ID | `depthBias` (Globe) | logic |
|:-----|:-----|:---------|:-------------------|:------|
| **1 — Global Tints** | 1 | `h3-coverage-layer`, `terminator-layer` | `0` | Base map overlays |
| | 1 | `aurora-oval-*` | `-5.0` | Atmospheric glow |
| **2 — Shading** | 2 | `country-outages-layer-*` | `-20.0` | Broad country context |
| | 3 | `nws-alerts-*` | `-30.0` | Regional weather boundaries |
| **3 — Restricted** | 4 | `airspace-zones-*` | `-45.0` | **Restricted/Danger Boundaries** |
| **4 — Infra Assets** | 5 | `submarine-cables-layer-*` | `-70.0` | Subsea lines |
| | 5 | `cable-stations-layer-*` | `-80.0` | Landing points |
| | 5 | `peeringdb-ixp-layer-*`, `fac-layer-*` | `-85.0` | Data exchange points |
| | 5 | `ndbc-buoys-*` | `-90.0` | Oceanic sensors |
| **5 — Dynamic** | 6 | `jamming-pulse-*`, `stdbscan-cluster-*` | `-110.0` | Active signal interference |
| | 6 | `jamming-fill-*` | `-115.0` | Static interference zones |
| **6 — Boundaries** | 7 | `aot-maritime-*`, `aviation-*`, `horizon-*` | `-200.0` | Mission AOR boundaries |
| **7 — Tactical** | 8 | `all-history-trails-*` | `-150.0` | Entity paths |
| | 9 | `ground-shadows-*` | `-195.0` | Surface projections |
| | 9 | `entity-tactical-halo-*` | `-150.0` | Detection halos |
| | 9 | `heading-arrows-globe` | `-200.0` | Directional icons |
| | 9 | `entity-glow-*`, `selection-ring-*` | `-210.0` | Selection/Status glow |
| | 9 | `velocity-vectors-*` | `-250.0` | Predicted movement (top) |

---

## Globe Mode depthBias Priority Order (most negative = front)

```
-250  velocity-vectors              ← always topmost
-210  entity-glow / selection-ring
-205  holding-patterns (aviation)
-200  mission-aot-boundaries / observer-horizon
-195  ground-shadows
-150  entity-tactical-halo / history-trails
-115  jamming-fill-halo
-110  jamming-pulse-ring / stdbscan-clusters
-90   ndbc-buoy-sensors
-85   peeringdb-ixps / facilities
-80   cable-landing-stations
-70   submarine-cables
-45   open-airspace-zones
-30   nws-weather-alerts
-20   internet-outage-shading
 -5   aurora-oval
  0   h3-grid / terminator
```

---

## Common Mistakes and How to Avoid Them

### 1. Applying `depthTest: true` globally to a new layer

If you are adding a `ScatterplotLayer` or `PathLayer` with `getPosition → [lon, lat, 0]`,
you **must** use the conditional pattern:

```ts
parameters: { depthTest: !!globeMode, depthBias: globeMode ? -N : 0 }
```

Never use `depthTest: true` unconditionally for z=0 surface geometry in Mercator mode.
This was the root cause of the RF layer rendering regression in v0.28.5 (`5cfc953`).

### 2. Picking a `depthBias` that conflicts with an existing layer

Before choosing a bias value for Globe mode, check the priority table above. Pick a value
that places your layer in the correct visual tier. Leave at least `10.0` of separation between
tiers so rounding errors don't cause flicker.

### 3. Adding a layer outside `build*Layers.ts` (inline in `useAnimationLoop.ts`)

Inline layers like `kiwi-node-*` do not set `parameters` at all (uses WebGL default
`depthTest: false`). This works because they render in draw order between RF layers (slot 6)
and trail layers (slot 8). If you add an inline layer, explicitly set `parameters` rather than
relying on defaults — the default can change across deck.gl versions.

### 4. Forgetting `wrapLongitude: !globeMode`

All surface layers that can span the antimeridian need `wrapLongitude: !globeMode`. Globe mode
handles wrapping in the projection; enabling it in Globe mode causes rendering artifacts.

---

## Animation Loop Data Threading

> [!CAUTION]
> This is the **most common silent failure mode** for new layers. A layer builder that receives `undefined` instead of its data ref will produce **no error, no warning, and no visible output** — the layer simply doesn't render.

### How Data Reaches the Layer Builder

The animation loop (`useAnimationLoop.ts`) is the single place where all layer builders are called. It receives data through two mechanisms:

| Mechanism | Examples | How it flows |
|-----------|----------|--------------|
| **Plain data props** | `cablesData`, `stationsData`, `outagesData`, `worldCountriesData` | Passed as normal React props → `TacticalMap` props → `useAnimationLoop` args → `buildInfraLayers(...)` |
| **MutableRef props** | `rfSitesRef`, `js8StationsRef`, `ownGridRef`, `kiwiNodeRef`, `entitiesRef`, `satellitesRef` | Passed as React refs → must be explicitly threaded through **every** call boundary |

### The Complete Threading Chain for Ref-based Data

For any `MutableRefObject` data source, it must appear at **all four** of these locations:

```
1. useRFSites (or equivalent hook)          → produces rfSitesRef
2. TacticalMap props interface              → rfSitesRef?: MutableRefObject<RFSite[]>
3. TacticalMap useAnimationLoop({...})      → rfSitesRef,          ← MOST COMMONLY MISSED
4. useAnimationLoop options interface       → rfSitesRef?: MutableRefObject<RFSite[]>
5. buildRFLayers(..., rfSitesRef.current)   → consumes the data
```

Missing **step 3** means the hook receives `undefined` — the guard `if (showRepeaters && rfSitesRef && ...)` silently short-circuits and the layer is never built. This was the root cause of the RF repeater layer not rendering (fixed 2026-03-14, see `agent_docs/tasks/2026-03-14-fix-rf-layer-rendering.md`).

### Layer Builder → Data Dependency Table

| Layer Builder | Called From | Required Refs/Props | Guard Condition |
|---------------|-------------|--------------------|-----------------|
| `buildRFLayers` | `useAnimationLoop` | `rfSitesRef` (ref) | `showRepeaters && rfSitesRef && rfSitesRef.current.length > 0` |
| `buildJS8Layers` | `useAnimationLoop` | `js8StationsRef`, `ownGridRef` (refs) | `js8StationsRef && ownGridRef` |
| `buildInfraLayers` | `useAnimationLoop` | `cablesData`, `stationsData`, `outagesData` (plain props) | always called, visibility internal |
| `buildEntityLayers` | `useAnimationLoop` | `entitiesRef`, `visualStateRef` (refs) | always called |
| `buildAOTLayers` | `useAnimationLoop` | `aotShapes` (state via ref), `currentMissionRef` | always called |
| `getOrbitalLayers` | `useAnimationLoop` | `satellitesRef` (ref, pre-filtered) | always called |
| `buildTrailLayers` | `composition.ts` | `interpolatedEntities` | always called |
| `kiwi-node-*` (inline) | `composition.ts` | `kiwiNode` | `kiwiNode && kiwiNode.lat !== 0` |

---

## Adding a New Layer Checklist

**Step 0 — Thread your data ref (do this before any rendering work):**
- [ ] Add the ref/prop to the hook/component that produces the data
- [ ] Add it to `TacticalMapProps` interface in `TacticalMap.tsx`
- [ ] Destructure it in the `TacticalMap` function body
- [ ] Pass it to `useAnimationLoop({..., myNewRef, ...})`
- [ ] Add it to `UseAnimationLoopOptions` interface in `useAnimationLoop.ts`
- [ ] Destructure it in the `useAnimationLoop` call
- [ ] Add it to the `useEffect` dependency array if it's a plain value (refs don't need this)

1. **Determine z-position**: Is geometry at z=0 (surface) or z=altitude (airborne/orbital)?
2. **Choose the parameter pattern**:
   - z=0, not billboard → `{ depthTest: !!globeMode, depthBias: globeMode ? -N : 0 }`
   - z=altitude or billboard → `{ depthTest: true, depthBias: -N }`
   - Background / always-behind → `{ depthTest: true, depthBias: +N }` (positive, satellite footprint pattern)
3. **Pick a `depthBias` value** from the priority table — does it place the layer in the right visual tier?
4. **Set `wrapLongitude: !globeMode`** on all surface geometry layers.
5. **Insert the layer at the correct slot** in the `useAnimationLoop.ts` `layers` array — draw order is the tiebreaker when `depthTest: false`.
6. **Test both modes**: Toggle globe mode in the UI and verify the layer appears correctly in both.

---

## Source Files

- `frontend/src/layers/composition.ts` — final `layers` array composition
- `frontend/src/layers/buildRFLayers.ts`
- `frontend/src/layers/buildEntityLayers.ts`
- `frontend/src/layers/buildInfraLayers.ts`
- `frontend/src/layers/buildTrailLayers.ts`
- `frontend/src/layers/buildAOTLayers.ts`
- `frontend/src/layers/buildJS8Layers.ts`
- `frontend/src/layers/buildH3CoverageLayer.ts`
- `frontend/src/layers/buildAirspaceLayer.ts`
- `frontend/src/layers/buildWeatherAlertsLayer.ts`
- `frontend/src/layers/buildClusterLayer.ts`
- `frontend/src/layers/buildJammingLayer.ts`
- `frontend/src/layers/OrbitalLayer.tsx`
- `frontend/src/components/map/TerminatorLayer.tsx`
- `frontend/src/components/map/MapboxAdapter.tsx` — `_full3d: true` (Mercator + Mapbox token)
- `frontend/src/components/map/MapLibreAdapter.tsx` — Globe and Mercator no-token fallback
