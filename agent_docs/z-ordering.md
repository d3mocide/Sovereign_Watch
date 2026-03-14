# Sovereign Watch — Layer Depth & Z-Ordering Reference

**Last Updated:** 2026-03-14
**Applies To:** `useAnimationLoop.ts`, all `build*Layers.ts` files, `OrbitalLayer.tsx`

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

## Draw Order and Depth Matrix

Layers are appended to the `layers` array in `useAnimationLoop.ts` in this order. Within the
same nominal draw slot, the last entry wins for same-depth fragments.

| Slot | Layer ID | Layer Type | `depthTest` | `depthBias` | z pos | File |
|------|----------|------------|-------------|-------------|-------|------|
| 1 | `h3-coverage-layer` | H3HexagonLayer | `false` | — | surface | `buildH3CoverageLayer.ts` |
| 2 | `terminator-layer` | GeoJsonLayer | `false` | — | surface | `TerminatorLayer.tsx` |
| 3 | `country-outages-layer-{merc\|globe}` | GeoJsonLayer | `true` | `-50.0` | surface | `buildInfraLayers.ts` |
| 3 | `submarine-cables-layer-{merc\|globe}` | GeoJsonLayer | `true` | `-100.0` | surface | `buildInfraLayers.ts` |
| 3 | `cable-stations-layer-{merc\|globe}` | ScatterplotLayer | `true` | `-110.0` | z=0 | `buildInfraLayers.ts` |
| 4 | `satellite-footprint-{merc\|globe}` | ScatterplotLayer | `true` | `+50.0` | z=alt | `OrbitalLayer.tsx` |
| 4 | `satellite-footprint-label-{merc\|globe}` | TextLayer | `false` | — | z=0 | `OrbitalLayer.tsx` |
| 4 | `satellite-ground-track-{merc\|globe}` | PathLayer | `true` | `+50.0` | z=alt | `OrbitalLayer.tsx` |
| 4 | `satellite-gap-bridge-{merc\|globe}` | PathLayer | `true` | `+50.0` | z=alt | `OrbitalLayer.tsx` |
| 4 | `satellite-predicted-track-{merc\|globe}` | PathLayer | `true` | `+60.0` | z=alt | `OrbitalLayer.tsx` |
| 4 | `satellite-markers-merc-{sfx}` | IconLayer | `true` | `0` | z=alt | `OrbitalLayer.tsx` |
| 4 | `satellite-markers-globe-{sfx}` | SolidPolygonLayer | `true` | — | z=alt | `OrbitalLayer.tsx` |
| 4 | `satellite-selection-ring-{uid}` | ScatterplotLayer | `true` | `-201.0` | z=alt | `OrbitalLayer.tsx` |
| 5 | `aot-maritime-{merc\|globe}` | PathLayer | `!!globeMode` | globe:`-200.0` merc:`0` | z=0 | `buildAOTLayers.ts` |
| 5 | `aot-aviation-{merc\|globe}` | PathLayer | `!!globeMode` | globe:`-200.0` merc:`0` | z=0 | `buildAOTLayers.ts` |
| 5 | `aot-orbital-horizon-{merc\|globe}` | PathLayer | `!!globeMode` | globe:`-200.0` merc:`0` | z=0 | `buildAOTLayers.ts` |
| 5 | `aot-orbital-observer-{merc\|globe}` | ScatterplotLayer | `false` | — | z=0 | `buildAOTLayers.ts` |
| 5 | `aot-rf-horizon-{merc\|globe}` | PathLayer | `!!globeMode` | globe:`-200.0` merc:`0` | z=0 | `buildAOTLayers.ts` |
| 6 | `rf-cluster-halo-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-100.0` merc:`0` | z=0 | `buildRFLayers.ts` |
| 6 | `rf-clusters-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-100.0` merc:`0` | z=0 | `buildRFLayers.ts` |
| 6 | `rf-cluster-labels-{merc\|globe}` | TextLayer | `!!globeMode` | globe:`-100.0` merc:`0` | z=0 | `buildRFLayers.ts` |
| 6 | `rf-halo-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-100.0` merc:`0` | z=0 | `buildRFLayers.ts` |
| 6 | `rf-dots-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-100.0` merc:`0` | z=0 | `buildRFLayers.ts` |
| 6 | `rf-labels-{merc\|globe}` | TextLayer (billboard) | `true` | `-100.0` | z=0 | `buildRFLayers.ts` |
| 7 | `kiwi-node-glow` | ScatterplotLayer | default (`false`) | — | z=0 | `useAnimationLoop.ts` (inline) |
| 7 | `kiwi-node-ring-outer` | ScatterplotLayer | default (`false`) | — | z=0 | `useAnimationLoop.ts` (inline) |
| 7 | `kiwi-node-core` | ScatterplotLayer | default (`false`) | — | z=0 | `useAnimationLoop.ts` (inline) |
| 7 | `kiwi-node-label` | TextLayer (billboard) | default (`false`) | — | z=0 | `useAnimationLoop.ts` (inline) |
| 8 | `all-history-trails-{merc\|globe}` | PathLayer | `true` | `-50.0` | z=alt | `buildTrailLayers.ts` |
| 8 | `history-gap-bridge-{merc\|globe}` | PathLayer | `true` | `-50.0` | z=alt | `buildTrailLayers.ts` |
| 8 | `selected-trail-{uid}-{merc\|globe}` | PathLayer | `true` | `-50.0` | z=alt | `buildTrailLayers.ts` |
| 8 | `selected-gap-bridge-{uid}-{merc\|globe}` | LineLayer | `true` | `-50.0` | z=alt | `buildTrailLayers.ts` |
| 9 | `altitude-stems-{merc\|globe}` | LineLayer | `true` | `-1.0` | z=0→alt | `buildEntityLayers.ts` |
| 9 | `ground-shadows-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-195.0` merc:`0` | z=0 | `buildEntityLayers.ts` |
| 9 | `entity-tactical-halo-{merc\|globe}` | IconLayer | `true` | `-150.0` | z=alt | `buildEntityLayers.ts` |
| 9 | `heading-arrows-globe` | PolygonLayer | `true` | `-200.0` | z=alt | `buildEntityLayers.ts` |
| 9 | `heading-arrows-merc` | IconLayer | `true` | `-100.0` | z=alt | `buildEntityLayers.ts` |
| 9 | `entity-glow-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-210.0` merc:`0` | z=alt | `buildEntityLayers.ts` |
| 9 | `selection-ring-{uid}-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-210.0` merc:`0` | z=alt | `buildEntityLayers.ts` |
| 9 | `velocity-vectors-{merc\|globe}` | PathLayer | `true` | `-250.0` | z=alt | `buildEntityLayers.ts` |
| 10 | `js8-bearing-lines-{merc\|globe}` | LineLayer | `!!globeMode` | globe:`-210.0` merc:`0` | z=0 | `buildJS8Layers.ts` |
| 10 | `js8-stations-{merc\|globe}` | ScatterplotLayer | `!!globeMode` | globe:`-210.0` merc:`0` | z=0 | `buildJS8Layers.ts` |
| 10 | `js8-labels-{merc\|globe}` | TextLayer (billboard) | `true` | `-210.0` | z=0 | `buildJS8Layers.ts` |

---

## Globe Mode depthBias Priority Order (most negative = front)

```
-250  velocity-vectors              ← always topmost
-210  heading-arrows-globe
-210  entity-glow (globe)
-210  selection-ring (globe)
-210  js8-stations (globe)
-210  js8-labels
-210  js8-bearing-lines (globe)
-201  satellite-selection-ring
-200  heading-arrows-globe (polygon)
-200  aot-* boundaries (globe)
-195  ground-shadows (globe)
-150  entity-tactical-halo
-110  cable-stations
-100  rf-* layers (globe)
-100  submarine-cables
 -50  country-outages
 -50  history trails
  -1  altitude-stems
   0  satellite-markers-merc
  +50  satellite-footprint / ground-track  ← pushed furthest back
  +60  satellite-predicted-track           ← furthest back of all
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

## Adding a New Layer Checklist

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

- `frontend/src/hooks/useAnimationLoop.ts` — final `layers` array composition (lines ~796–874)
- `frontend/src/layers/buildRFLayers.ts`
- `frontend/src/layers/buildEntityLayers.ts`
- `frontend/src/layers/buildInfraLayers.ts`
- `frontend/src/layers/buildTrailLayers.ts`
- `frontend/src/layers/buildAOTLayers.ts`
- `frontend/src/layers/buildJS8Layers.ts`
- `frontend/src/layers/buildH3CoverageLayer.ts`
- `frontend/src/layers/OrbitalLayer.tsx`
- `frontend/src/components/map/TerminatorLayer.tsx`
- `frontend/src/components/map/MapboxAdapter.tsx` — `_full3d: true` (Mercator + Mapbox token)
- `frontend/src/components/map/MapLibreAdapter.tsx` — Globe and Mercator no-token fallback
