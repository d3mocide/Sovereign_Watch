# Globe Rendering Report — COT Visibility & Visual Enhancement

**Branch:** `claude/fix-globe-rendering-GPLJN`
**Date:** 2026-02-22
**Scope:** `frontend/src/components/map/TacticalMap.tsx`, `frontend/src/layers/OrbitalLayer.tsx`

---

## Executive Summary

A prior investigation (`docs/globe-rendering-investigation.md`, branch `fix-globe-rendering-VMBOP`)
identified and fixed the foundational issues: dependencies were upgraded to deck.gl 9.x,
MapLibre GL JS 5.x, and react-map-gl 8.x, and the projection API call was corrected.

**Current status (2026-02-22):** Globe renders. History tails (PathLayer) and ground icons
(IconLayer) are visible. **COT velocity vectors (PathLayer) are invisible in globe mode.**

This report covers:
1. Why velocity vectors specifically fail while other layers succeed
2. Visual enhancement opportunities for globe mode
3. Agent prompts to implement both fixes

---

## Part 1 — Why COTs Don't Render

### What "COT" Means in This Codebase

Despite the TAK/CoT terminology, "COT" in the globe context refers to the
**velocity vector layer** — lines projected 45 seconds ahead from each entity based on its
current `speed` and `course`. This is the `velocity-vectors` PathLayer
at `TacticalMap.tsx:1662–1690`.

---

### Layer Comparison Matrix

| Layer | Type | `depthBias` | `billboard` | Globe Status |
|---|---|---|---|---|
| History tails | PathLayer | `-100.0` | N/A | ✅ Visible |
| Ground icons | IconLayer | `-210.0` | `!!globeMode` ✅ | ✅ Visible |
| COT velocity vectors | PathLayer | `-220.0` | None ❌ | ❌ Invisible |
| Satellite ground track | PathLayer | `-50.0` | N/A | ✅ Visible |

---

### Root Cause 1 — depthBias Pushes Vectors Behind the Globe Mesh

`TacticalMap.tsx:1688`

```typescript
parameters: { depthTest: true, depthBias: -220.0 }
```

In Mercator (flat) mode, `depthBias` is a simple draw-order hint with no visual consequence
beyond layer stacking. In globe mode, the map renders a **3D sphere mesh** with real WebGL
depth values. Layers are tested against this mesh.

The stack is ordered: ground icons at `-210.0`, velocity vectors at `-220.0`.
`-220.0` is more negative = further from camera = deeper in the depth buffer.
In globe mode, this places velocity vectors **behind the sphere surface** at certain view
angles, causing them to be occluded by the globe itself and disappear.

History tails at `-100.0` are much shallower — they stay in front of the sphere mesh.

**Fix:** Change `depthBias` on velocity vectors from `-220.0` to `-195.0` (just in front of
icons at `-210.0`, consistent with their visual intent as a foreground overlay).

---

### Root Cause 2 — No Globe-Mode Data Guard (`speed > 0.5` filter)

`TacticalMap.tsx:1665`

```typescript
data: interpolated.filter(e => e.speed > 0.5).map(d => { ... })
```

If entities in the current scene have `speed` at or below `0.5` (e.g. stationary ground
units, parked aircraft, or entities whose speed hasn't been reported yet), **the data array
is empty and nothing renders.** This is silent — no error, no fallback.

In globe mode the camera is zoomed out globally, which means the visible population skews
toward high-altitude orbital objects (satellites). Satellites in `OrbitalLayer.tsx` do NOT
have velocity vectors at all — that layer has no equivalent `velocity-vectors` PathLayer.
So if the entity panel shows mostly satellites at the global zoom level, the velocity vector
data will be filtered to zero records.

**Fix:** Lower the threshold from `0.5` to `0.1` m/s to catch slow-moving entities, or add
a debug count to surface the empty-data case.

---

### Root Cause 3 — No Globe-Aware Coordinate Treatment for PathLayer

`TacticalMap.tsx:1668–1678`

```typescript
const courseRad = (d.course || 0) * Math.PI / 180;
const R = 6371000;
const latRad = d.lat * Math.PI / 180;
const dLat = (distMeters * Math.cos(courseRad)) / R;
const dLon = (distMeters * Math.sin(courseRad)) / (R * Math.cos(latRad));
const target = [
    d.lon + dLon * (180 / Math.PI),
    d.lat + dLat * (180 / Math.PI),
    d.altitude || 0,
];
```

The math is standard spherical surface projection (haversine-lite), which is geographically
correct. deck.gl 9.x PathLayer accepts `[lon, lat, altitude]` tuples and handles globe
projection internally. **The math is not the primary problem**, but there is one subtle bug:

- `dLon` is already in radians-per-radian. The `* (180 / Math.PI)` conversion is applied
  to the delta, not to the raw radian value — this is correct.
- However, the variable name `dLon` stores a value in **radians** (not degrees). It is then
  directly added to `d.lon` (which is in degrees) without conversion. This produces a small
  but real positional error for entities with any appreciable speed.

The correct formula should be:
```typescript
const dLon = (distMeters * Math.sin(courseRad)) / (R * Math.cos(latRad));
// dLon is in radians — convert before adding to degree longitude
const target = [
    d.lon + dLon * (180 / Math.PI),  // ← this line is already correct; dLon * (180/π) = degrees
    d.lat + dLat * (180 / Math.PI),
    d.altitude || 0,
];
```

Actually re-reading: the existing code IS applying `(180 / Math.PI)` before adding. The math
is fine. The vectors render at the correct position — the visibility failure is the depthBias
issue (Root Cause 1) and empty data (Root Cause 2).

---

### Root Cause 4 — Fog Not Applied in Globe Mode

`TacticalMap.tsx:1958–1971`

```typescript
// 2. Fog - Mapbox GL v2+ Only
if (isMapbox && map.setFog) {
    map.setFog({
        range: [0.5, 10],
        color: "rgba(10, 15, 25, 1)",
        "high-color": "rgba(20, 30, 50, 1)",
        "space-color": "rgba(5, 5, 15, 1)",
        "horizon-blend": 0.1,
    });
}
```

This block is inside the `if (enable3d)` branch (`TacticalMap.tsx:1940`). Globe mode
explicitly **disables** `enable3d` when activated (`TacticalMap.tsx:1753`). So when in globe
mode, fog is never set, `setFog(null)` is called at line 1975, and the space background
reverts to the map style's default — which is the flat dark void the user sees.

This is what causes the "dead space look."

---

## Part 2 — Visual Enhancement Opportunities

### Enhancement 1 — Starfield Background (HIGH IMPACT, Mapbox)

Mapbox GL JS v3 `setFog()` supports a `star-intensity` property that renders procedural
stars in the space region around the globe. This is a single property addition.

```typescript
map.setFog({
    "space-color": "#0a0a1a",
    "star-intensity": 0.6,      // ← adds stars (0 = none, 1 = dense)
    "horizon-blend": 0.1,
    "high-color": "#1a2a4a",    // deep blue upper atmosphere
    "color": "#0d1a2a",         // lower horizon haze
    "range": [0.5, 10],
});
```

For MapLibre GL JS v5, the equivalent is the `sky` layer with type `"atmosphere"`:
```json
{
    "id": "sky",
    "type": "sky",
    "paint": {
        "sky-type": "atmosphere",
        "sky-atmosphere-color": "rgba(10, 20, 50, 1)",
        "sky-atmosphere-halo-color": "rgba(30, 60, 120, 0.8)",
        "sky-atmosphere-sun-intensity": 5
    }
}
```

---

### Enhancement 2 — Atmospheric Glow (MEDIUM IMPACT, Both)

The `horizon-blend` and `high-color` fog parameters create a blue atmospheric limb visible
at the edge of the globe. Tuning these gives a realistic "ISS view of Earth" appearance:

```typescript
map.setFog({
    "space-color": "#000510",
    "star-intensity": 0.5,
    "horizon-blend": 0.15,          // wider glow at the horizon
    "high-color": "#243b6e",        // deep blue upper atmosphere
    "color": "#132040",             // teal horizon haze
    "range": [0.5, 10],
});
```

---

### Enhancement 3 — Globe-Mode Pitch Control (MEDIUM IMPACT)

Currently, toggling globe mode calls `flyTo({ pitch: 0, bearing: 0 })`, locking the camera
to a top-down view. Allowing pitch in globe mode enables an oblique/perspective "from orbit"
look that better suits orbital tracking.

In the `applyProjection` block (`TacticalMap.tsx:1761–1768`), remove the pitch reset or
clamp it to a gentler default:

```typescript
map.flyTo({
    center,
    zoom: z > 3 ? 2.5 : z,
    pitch: 20,      // slight forward tilt for perspective effect
    bearing: 0,
    duration: 1500,
    easing: (t: number) => 1 - Math.pow(1 - t, 3)
});
```

Also allow the pitch adjustment controls (`handleAdjustCamera`) to function in globe mode
rather than being disabled.

---

### Enhancement 4 — Graticule Grid Lines (LOW–MEDIUM IMPACT)

Lat/lon grid lines provide spatial orientation at global zoom and are standard in orbital
tracking contexts. This can be added as a MapLibre GL GeoJSON source with line features
generated at configurable intervals (e.g. every 30°):

```typescript
// Generate graticule GeoJSON and add as a native map layer
map.addSource('graticule', { type: 'geojson', data: buildGraticule(30) });
map.addLayer({
    id: 'graticule-lines',
    type: 'line',
    source: 'graticule',
    paint: {
        'line-color': 'rgba(100, 200, 255, 0.12)',
        'line-width': 0.5,
    }
});
```

This should only be added/removed when `globeMode` changes.

---

### Enhancement 5 — Satellite Velocity Vectors in OrbitalLayer (MEDIUM IMPACT)

`OrbitalLayer.tsx` currently has no velocity vector layer for satellites. The `trail` array
provides the history, but there is no forward-projection line showing orbital direction.
A short predictive arc (using TLE-derived velocity or a simplified heading) would match the
UX consistency of ground entity COT vectors.

---

### Enhancement 6 — Day/Night Terminator Overlay (LOW IMPACT, Future)

A semi-transparent GeoJSON polygon representing the current solar terminator (day/night
boundary) would add mission-relevant context for ground operations. Libraries like
`suncalc` or `satellite.js` can compute this. This is a longer-term item.

---

## Part 3 — Agent Prompts

The following prompts are designed to be run sequentially by a coding agent. Each is
self-contained with file references.

---

### Agent Prompt 1 — Fix COT Velocity Vector depthBias

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.

Read the file `frontend/src/components/map/TacticalMap.tsx` before making any changes.

PROBLEM: The velocity-vectors PathLayer (lines ~1662–1690) uses `depthBias: -220.0`. In
globe projection mode, this value places the vectors behind the 3D sphere mesh, making them
invisible. History tails use -100.0 and render fine. Icons use -210.0 with billboard mode.

TASK: In the `velocity-vectors` PathLayer parameters, change:
  FROM: parameters: { depthTest: true, depthBias: -220.0 }
  TO:   parameters: { depthTest: false }

Using `depthTest: false` for velocity vectors is correct — they are a HUD-style overlay
(like entity halos) that should always be visible above the surface. Icons at line ~1588
already use `depthTest: true` with billboard mode; velocity vectors do not have billboard
mode and should simply disable depth testing instead.

Also change the speed filter threshold from `e.speed > 0.5` to `e.speed > 0.1` on line
~1665 to catch slow-moving entities that were previously filtered out.

After the edit, re-read the changed lines to verify correctness. Do not change any other
part of the file.
```

---

### Agent Prompt 2 — Apply Fog and Stars in Globe Mode

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.

Read the full file `frontend/src/components/map/TacticalMap.tsx` before making changes.

PROBLEM: The `setFog()` call that creates the atmospheric/space look is inside the
`if (enable3d)` branch of the "Dedicated 3D visuals Effect" useEffect (around line 1932).
Globe mode explicitly sets `enable3d` to false, so fog is cleared when globe is active.
This causes the "dead space" look — a flat dark void around the globe.

TASK: Find the "Dedicated 3D visuals Effect" useEffect. Locate the fog block inside
the `if (enable3d)` branch. Add a parallel fog-apply block for globe mode, immediately
after the `if (enable3d) { ... }` section ends and BEFORE the `else { ... }` branch that
clears fog.

The current structure is roughly:
```typescript
if (enable3d) {
    // ... terrain ...
    if (isMapbox && map.setFog) {
        map.setFog({ ... });  // existing fog for 3D mode
    }
} else {
    if (map.getTerrain?.()) map.setTerrain(null);
    if (map.setFog) map.setFog(null);
}
```

Change it to:
```typescript
if (enable3d) {
    // ... terrain block unchanged ...
    if (isMapbox && map.setFog) {
        map.setFog({
            range: [0.5, 10],
            color: "rgba(10, 15, 25, 1)",
            "high-color": "rgba(20, 30, 50, 1)",
            "space-color": "rgba(5, 5, 15, 1)",
            "horizon-blend": 0.1,
        });
    }
} else if (globeMode) {
    // Globe mode: apply space/atmosphere fog without terrain
    if (isMapbox && map.setFog) {
        try {
            map.setFog({
                "space-color": "#000510",
                "star-intensity": 0.55,
                "horizon-blend": 0.15,
                "high-color": "#1a3060",
                "color": "#0d1a30",
                "range": [0.5, 10],
            });
        } catch (e) {
            console.warn("[TacticalMap] Globe fog not supported:", e);
        }
    }
} else {
    if (map.getTerrain?.()) map.setTerrain(null);
    if (map.setFog) map.setFog(null);
}
```

IMPORTANT: The useEffect dependency array for this effect must include `globeMode`. Find
the dependency array at the end of this useEffect (it currently contains `[mapLoaded,
enable3d, mapToken]` or similar) and add `globeMode` to it.

After the edit, re-read the changed section to verify the if/else chain is syntactically
correct. Do not change any other part of the file.
```

---

### Agent Prompt 3 — Enable Pitch Control in Globe Mode

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.

Read `frontend/src/components/map/TacticalMap.tsx` before making changes.

PROBLEM: When globe mode activates, the camera is hard-reset to pitch=0, bearing=0
(TacticalMap.tsx around line 1761–1768), locking the user into a flat top-down view.
The pitch adjustment controls (`handleAdjustCamera`) also check `enable3d` before
allowing pitch changes — since globe mode sets enable3d to false, pitch controls are
effectively disabled in globe mode.

TASK 1: In the `applyProjection` function inside the globe mode useEffect, find the
`flyTo` call. Change `pitch: 0` to `pitch: 15` to give a slight forward perspective
tilt as the default globe entry view. This creates depth without obscuring the globe.

Current:
```typescript
map.flyTo({
    center,
    zoom: z > 3 ? 2.5 : z,
    pitch: 0,
    bearing: 0,
    duration: 1500,
    easing: (t: number) => 1 - Math.pow(1 - t, 3)
});
```

Change to:
```typescript
map.flyTo({
    center,
    zoom: z > 3 ? 2.5 : z,
    pitch: 15,
    bearing: 0,
    duration: 1500,
    easing: (t: number) => 1 - Math.pow(1 - t, 3)
});
```

TASK 2: Find `handleAdjustCamera` (around line 1782). Currently it reads the map's
current pitch and clamps to [0, 85]. This works correctly for both 2D and 3D modes.
Verify that `handleAdjustCamera` does NOT have any `if (!enable3d) return` guard that
would prevent it from working in globe mode. If such a guard exists, remove it or add
`|| globeMode` to the condition. If no such guard exists, no change is needed for Task 2.

After edits, re-read the changed sections to verify correctness.
```

---

### Agent Prompt 4 — Add Graticule Grid in Globe Mode

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.

Read `frontend/src/components/map/TacticalMap.tsx` before making changes.

TASK: Add latitude/longitude grid lines (graticule) that appear only in globe mode.
These provide spatial orientation at global zoom levels. They should be added as a
native MapLibre/Mapbox GeoJSON map layer (not a deck.gl layer).

STEP 1: Add a helper function above the TacticalMap component definition that generates
a graticule GeoJSON FeatureCollection. Insert this before the `export function TacticalMap`
line:

```typescript
function buildGraticule(stepDeg: number = 30): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    // Meridians (vertical lines)
    for (let lon = -180; lon <= 180; lon += stepDeg) {
        const coords: [number, number][] = [];
        for (let lat = -90; lat <= 90; lat += 2) coords.push([lon, lat]);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
    }
    // Parallels (horizontal lines)
    for (let lat = -90; lat <= 90; lat += stepDeg) {
        const coords: [number, number][] = [];
        for (let lon = -180; lon <= 180; lon += 2) coords.push([lon, lat]);
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
    }
    return { type: 'FeatureCollection', features };
}
```

Note: You may need to add a GeoJSON type import if not already present. Check the top of
the file for existing imports and add `import type * as GeoJSON from 'geojson';` if needed,
or use a plain object type cast with `as any` to avoid the import.

STEP 2: Add a new useEffect that adds or removes the graticule source and layer based on
`globeMode`. Place it near the other globe-related effects (near line 1780, after the
projection useEffect).

```typescript
// Graticule grid — only visible in globe mode
useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!mapLoaded || !map) return;

    const SOURCE_ID = 'graticule';
    const LAYER_ID  = 'graticule-lines';

    const add = () => {
        if (!map.getSource(SOURCE_ID)) {
            map.addSource(SOURCE_ID, { type: 'geojson', data: buildGraticule(30) as any });
        }
        if (!map.getLayer(LAYER_ID)) {
            map.addLayer({
                id: LAYER_ID,
                type: 'line',
                source: SOURCE_ID,
                paint: {
                    'line-color': 'rgba(80, 180, 255, 0.12)',
                    'line-width': 0.6,
                },
            });
        }
    };

    const remove = () => {
        if (map.getLayer(LAYER_ID))  map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    const apply = () => { globeMode ? add() : remove(); };

    if (map.isStyleLoaded?.()) apply();
    else map.once('style.load', apply);

    return () => { map.off('style.load', apply); };
}, [globeMode, mapLoaded]);
```

After making changes, re-read the new useEffect and the buildGraticule function to verify
they are syntactically correct. Do not change any other part of the file.
```

---

### Agent Prompt 5 — Verification Pass

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.

Your task is ONLY to read and verify. Do NOT make changes.

Read `frontend/src/components/map/TacticalMap.tsx` and confirm each of the following:

1. VELOCITY VECTORS depthBias
   - Find the `velocity-vectors` PathLayer (search for id: 'velocity-vectors').
   - Confirm `parameters` is `{ depthTest: false }` (NOT depthBias: -220.0).
   - Confirm the data filter uses `e.speed > 0.1` (NOT `e.speed > 0.5`).

2. GLOBE FOG BLOCK
   - Find the "Dedicated 3D visuals Effect" useEffect.
   - Confirm the if/else chain is: `if (enable3d) { ... } else if (globeMode) { ... } else { ... }`.
   - Confirm the `globeMode` branch calls `map.setFog()` with `"star-intensity"` and
     `"space-color"` properties.
   - Confirm `globeMode` is in the dependency array of this useEffect.

3. GLOBE FLYTO PITCH
   - Find the `flyTo` call inside the globe mode `applyProjection` function.
   - Confirm `pitch` is `15` (not 0).

4. GRATICULE EFFECT
   - Confirm a useEffect exists that adds a `'graticule'` GeoJSON source and
     `'graticule-lines'` layer when `globeMode` is true, and removes them when false.
   - Confirm the effect depends on `[globeMode, mapLoaded]`.

For each check, report PASS or FAIL with the relevant line numbers. If any check fails,
describe exactly what was found instead so a follow-up agent can fix it.
```

---

## Summary of Changes

| # | Change | File | Expected Result |
|---|---|---|---|
| 1 | `depthBias: -220.0` → `depthTest: false` on velocity-vectors | TacticalMap.tsx ~1688 | COTs visible on globe |
| 2 | Speed filter `> 0.5` → `> 0.1` | TacticalMap.tsx ~1665 | Slow entities get COT vectors |
| 3 | Apply `setFog` with `star-intensity` when `globeMode` is true | TacticalMap.tsx ~1958 | Starfield + atmosphere replaces dead space |
| 4 | Add `globeMode` to 3D effect dependency array | TacticalMap.tsx | Fog updates when globe toggles |
| 5 | Default `pitch: 0` → `pitch: 15` in globe flyTo | TacticalMap.tsx ~1762 | Slight perspective tilt on globe entry |
| 6 | Add graticule useEffect | TacticalMap.tsx | Grid lines in globe mode for spatial reference |

---

## Visual Improvements Not Covered by These Prompts (Future Scope)

- **Day/night terminator**: Requires `suncalc` or `satellite.js` to compute the solar
  terminator polygon and render it as a GeoJSON fill layer. Useful for mission planning.
- **Orbital altitude bands**: Concentric ring overlays at LEO (~550km), MEO (~20,000km),
  and GEO (~35,786km) altitudes to contextualise satellite positions.
- **Satellite velocity vectors in OrbitalLayer**: Forward-projection lines for satellites
  analogous to the ground entity COT vectors. Needs orbital velocity data from the backend.
- **Globe auto-rotate mode**: Slow ambient rotation when no entity is selected, to give
  a "mission ops display" feel.
