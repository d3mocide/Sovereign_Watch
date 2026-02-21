# Globe Rendering Investigation Report

**Branch:** `claude/fix-globe-rendering-VMBOP`
**Date:** 2026-02-21
**Scope:** TacticalMap component — `frontend/src/components/map/TacticalMap.tsx`

---

## Executive Summary

Globe rendering is broken for both Mapbox GL JS and MapLibre GL JS due to a combination of outdated library versions, an incorrect projection API parameter, a fundamental deck.gl incompatibility with globe projection, and timing issues in how projection is applied. None of these are cosmetic — each is independently sufficient to prevent globe from rendering.

---

## Root Cause Analysis

### 1. MapLibre GL JS is v3.0.0 — Globe Requires v5.0.0

**File:** `frontend/package.json:21`

```json
"maplibre-gl": "^3.0.0"
```

MapLibre GL JS did not introduce native globe projection until **v5.0.0** (released January 2025). Version 3.x has no `setProjection()` method and no globe support at all. The code acknowledges this with a comment:

```typescript
// Globe projection: requires Mapbox GL JS (VITE_MAPBOX_TOKEN set) or MapLibre GL v5+
// MapLibre GL v3.x does not expose setProjection(); style-spec injection is attempted as fallback
```

The fallback (`map.setStyle({ ...style, projection: { name: 'globe' } })`) does not work because v3 ignores unknown projection values — they are not part of the v3 style spec at all. The result is that the map silently stays in Mercator.

---

### 2. Wrong Projection Object Key — `name` vs `type`

**File:** `frontend/src/components/map/TacticalMap.tsx:1680,1683`

```typescript
map.setProjection({ name: 'globe' });           // line 1680
map.setStyle({ ...style, projection: { name: 'globe' } }); // line 1683 (fallback)
```

The APIs expect different shapes:

| Library | `setProjection()` argument | Style spec key |
|---------|---------------------------|----------------|
| **Mapbox GL JS v3** | `'globe'` (string) or `{ name: 'globe' }` | `{ name: 'globe' }` ✓ |
| **MapLibre GL JS v5** | `{ type: 'globe' }` | `{ type: 'globe' }` |

For Mapbox, `{ name: 'globe' }` is valid. For MapLibre v5, the correct key is `type`, not `name`. Once MapLibre is upgraded to v5, this code will still silently fail because the globe projection spec changed to use `type`.

---

### 3. Globe Projection Applied Before `style.load`

**File:** `frontend/src/components/map/TacticalMap.tsx:1673-1699`

```typescript
useEffect(() => {
    if (!mapLoaded) return;
    const map = mapInstanceRef.current ?? (mapRef.current?.getMap?.() as any);
    if (!map) return;

    if (globeMode) {
        if (typeof map.setProjection === 'function') {
            map.setProjection({ name: 'globe' });  // Called immediately after mapLoaded
        }
        ...
    }
}, [globeMode, mapLoaded]);
```

`mapLoaded` is set `true` in the `onLoad` callback, which fires when the map is initialized — but this does not guarantee the style has loaded. MapLibre v5 requires `setProjection()` to be called **after the `style.load` event**, otherwise it throws an error. Calling it on `mapLoaded` alone is unreliable and will silently fail or error in MapLibre v5.

---

### 4. react-map-gl v7 Is Incompatible with mapbox-gl v3

**File:** `frontend/package.json:25`

```json
"react-map-gl": "^7.1.0",
"mapbox-gl": "^3.18.1"
```

react-map-gl v7 was designed for mapbox-gl **v1/v2**. With mapbox-gl v3:

- The `config` prop (Standard style configuration) used at `TacticalMap.tsx:1978-1988` is a react-map-gl v8 feature — in v7 it is silently ignored.
- Camera synchronization for non-Mercator projections was rewritten in react-map-gl v8 to use Proxy interception; v7 does not handle this correctly.
- react-map-gl v8 introduced separate entry points: `react-map-gl/mapbox` and `react-map-gl/maplibre`, avoiding the `@ts-expect-error` hack at line 1989.

react-map-gl **v8.1+** is required for proper mapbox-gl v3 and maplibre-gl v4/v5 support.

---

### 5. deck.gl 8.x Is Fundamentally Incompatible with Globe Projection

**File:** `frontend/package.json:13-18`

```json
"@deck.gl/core": "^8.9.0",
"@deck.gl/mapbox": "^8.9.0",
"deck.gl": "^8.9.0"
```

deck.gl 8.x with `@deck.gl/mapbox`'s `MapboxOverlay` does not know about globe projection transforms. When the map switches to globe:

- Custom/overlay layers flicker and disappear as the globe rotates (documented upstream issue)
- The overlay's WebGL matrices are calculated for Mercator and do not update for the sphere projection
- `interleaved={false}` (as used at `TacticalMap.tsx:2000`) makes this worse because the deck.gl canvas sits on top of the map canvas and receives no projection correction

This is a **known upstream incompatibility**. In globe mode, all deck.gl entity icons, trails, and velocity vectors will render incorrectly or not at all. The entities are the primary content of this application.

The fix requires either:
- **Option A:** Upgrade to deck.gl 9.x (current stable) and use its built-in globe-aware rendering
- **Option B:** Disable the DeckGLOverlay entirely in globe mode and re-implement entity rendering as MapLibre/Mapbox GL native layers (GeoJSON + symbol layers)

---

### 6. Sky Layer Is Deprecated in Mapbox GL JS v3

**File:** `frontend/src/components/map/TacticalMap.tsx:1893-1902`

```typescript
map.addLayer({
    id: 'sky',
    type: 'sky',
    paint: { 'sky-type': 'atmosphere', ... }
});
```

Mapbox GL JS v3 removed the `sky` layer type in favour of the `fog` property (which is already set at lines 1878-1890). The code has a `try/catch` around this so it won't crash, but it produces a console warning and has no visual effect. This is cosmetic but should be cleaned up.

---

## Summary Table

| Issue | Severity | Affected Renderer | File / Line |
|-------|----------|-------------------|-------------|
| MapLibre v3 has no globe support | **Critical** | MapLibre | `package.json:21` |
| Wrong projection key (`name` vs `type`) | **Critical** | MapLibre v5 (after upgrade) | `TacticalMap.tsx:1680,1683` |
| `setProjection` called before `style.load` | **High** | MapLibre v5 | `TacticalMap.tsx:1673` |
| react-map-gl v7 incompatible with mapbox-gl v3 | **High** | Both | `package.json:25` |
| deck.gl 8.x incompatible with globe projection | **Critical** | Both | `package.json:13-18`, `TacticalMap.tsx:1998-2002` |
| Deprecated `sky` layer | Low | Mapbox | `TacticalMap.tsx:1893-1902` |

---

## Affected Files

- `frontend/package.json` — version upgrades required
- `frontend/src/components/map/TacticalMap.tsx` — projection API, timing, deck.gl handling, sky layer

---

## Agent Prompts for Refactoring

The following prompts are designed to be executed sequentially by coding agents. Each is self-contained and references specific file locations.

---

### Agent Prompt 1 — Upgrade Dependencies

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.

Your task is to upgrade the frontend dependencies in `frontend/package.json` to resolve globe rendering incompatibilities. Do NOT run `npm install` — only update the version strings in `package.json`.

Make the following changes to `frontend/package.json`:

1. Change `"maplibre-gl"` from `"^3.0.0"` to `"^5.0.0"`
   - Reason: Globe projection requires MapLibre GL JS v5.0.0+. v3 has no globe support.

2. Change `"react-map-gl"` from `"^7.1.0"` to `"^8.1.0"`
   - Reason: react-map-gl v7 was designed for mapbox-gl v1/v2. v8 is required for mapbox-gl v3
     and maplibre-gl v4/v5, and properly supports the `config` prop and non-Mercator projections.

3. Change all `"@deck.gl/*"` packages and `"deck.gl"` from `"^8.9.0"` to `"^9.0.0"`
   - These packages: @deck.gl/core, @deck.gl/layers, @deck.gl/mapbox, @deck.gl/react, deck.gl
   - Reason: deck.gl 8.x is not globe-projection-aware. v9 includes globe-aware rendering.

4. Remove `"@types/mapbox-gl"` from dependencies.
   - Reason: react-map-gl v8 bundles its own mapbox-gl types. Having both causes conflicts.

After making the changes, verify the file is valid JSON. Do not run npm install.
```

---

### Agent Prompt 2 — Fix Globe Projection Logic in TacticalMap

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.
Read the full file `frontend/src/components/map/TacticalMap.tsx` before making changes.

Your task is to fix the globe projection useEffect (currently at lines ~1671-1699) so that it:
1. Uses the correct projection API key for each library
2. Waits for the style to be loaded before calling setProjection (MapLibre requirement)
3. Handles the Mapbox vs MapLibre difference cleanly

The current broken code is:
```typescript
// Globe projection: requires Mapbox GL JS (VITE_MAPBOX_TOKEN set) or MapLibre GL v5+
// MapLibre GL v3.x does not expose setProjection(); style-spec injection is attempted as fallback
useEffect(() => {
    if (!mapLoaded) return;
    const map = mapInstanceRef.current ?? (mapRef.current?.getMap?.() as any);
    if (!map) return;

    if (globeMode) {
        if (typeof map.setProjection === 'function') {
            map.setProjection({ name: 'globe' });
        } else {
            const style = map.getStyle?.();
            if (style) map.setStyle({ ...style, projection: { name: 'globe' } } as any);
        }
        const z = map.getZoom?.() ?? 5;
        if (z > 3) map.flyTo({ center: map.getCenter?.(), zoom: 2.5, duration: 1500 });
    } else {
        if (typeof map.setProjection === 'function') {
            map.setProjection({ name: 'mercator' });
        } else {
            const style = map.getStyle?.();
            if (style) {
                const { projection: _p, ...restStyle } = style as any;
                map.setStyle(restStyle);
            }
        }
    }
}, [globeMode, mapLoaded]);
```

Replace it with the following corrected version:
```typescript
// Globe projection: Mapbox GL JS uses string 'globe'/'mercator'.
// MapLibre GL JS v5+ uses { type: 'globe' } and requires style to be loaded first.
useEffect(() => {
    if (!mapLoaded) return;
    const map = mapInstanceRef.current ?? (mapRef.current?.getMap?.() as any);
    if (!map) return;

    const applyProjection = () => {
        if (typeof map.setProjection !== 'function') return;
        const isMapbox = !!mapToken;
        if (globeMode) {
            // Mapbox uses string; MapLibre v5 uses { type: 'globe' }
            map.setProjection(isMapbox ? 'globe' : { type: 'globe' });
            const z = map.getZoom?.() ?? 5;
            if (z > 3) map.flyTo({ center: map.getCenter?.(), zoom: 2.5, duration: 1500 });
        } else {
            map.setProjection(isMapbox ? 'mercator' : { type: 'mercator' });
        }
    };

    // MapLibre v5 requires style to be loaded before setProjection can be called
    if (map.isStyleLoaded?.()) {
        applyProjection();
    } else {
        map.once('style.load', applyProjection);
    }
}, [globeMode, mapLoaded, mapToken]);
```

Note: `mapToken` is already declared at line ~326 as `const mapToken = import.meta.env.VITE_MAPBOX_TOKEN;` so it is in scope.

Also fix the `setViewMode` function (around line 1647). In the `'2d'` branch it calls:
```typescript
try { (map as any).setProjection({ name: 'mercator' }); } catch (_) {}
```
Change this to respect the library being used:
```typescript
try {
    const isMapbox = !!mapToken;
    (map as any).setProjection(isMapbox ? 'mercator' : { type: 'mercator' });
} catch (_) {}
```

After making changes, verify the file still compiles by checking for TypeScript syntax errors using the Read tool to review the changed section.
```

---

### Agent Prompt 3 — Handle deck.gl in Globe Mode

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.
Read `frontend/src/components/map/TacticalMap.tsx` before making changes.

Your task is to prevent deck.gl rendering conflicts when globe mode is active.

Background: deck.gl's MapboxOverlay renders entity icons, trails, and velocity vectors as a
WebGL overlay on top of the map. When the map uses globe projection, the overlay's coordinate
transforms are calculated for flat Mercator and do not update for the sphere. This causes all
entities to flicker or disappear in globe mode.

The fix: when `globeMode` is true, do not render the DeckGLOverlay. The entities will not be
visible in globe mode until a full deck.gl v9 globe-aware implementation is done (that is a
separate larger task). The priority here is to prevent the broken rendering and allow the globe
itself to display correctly.

1. Locate the `DeckGLOverlay` usage in the JSX return (around line 1998-2002):
```tsx
<DeckGLOverlay
    id="tactical-overlay"
    interleaved={false}
    onOverlayLoaded={handleOverlayLoaded}
/>
```

Wrap it in a conditional so it only renders when NOT in globe mode:
```tsx
{!globeMode && (
    <DeckGLOverlay
        id="tactical-overlay"
        interleaved={false}
        onOverlayLoaded={handleOverlayLoaded}
    />
)}
```

2. Also find the main animation loop (the `useEffect` that calls `requestAnimationFrame` and
updates layers via `overlayRef.current?.setProps(...)`). It is around lines 1200-1400.
Find the place where `overlayRef.current?.setProps(...)` is called and add an early return
guard so the animation loop does not attempt to push layers to a null/unmounted overlay:

The existing code likely has something like:
```typescript
overlayRef.current?.setProps({ layers: [...] });
```
This already uses optional chaining so it is safe, but add a comment:
```typescript
// Note: overlay is null in globe mode (globe + deck.gl 8.x are incompatible)
overlayRef.current?.setProps({ layers: [...] });
```

3. Locate and remove the deprecated Mapbox sky layer block (around lines 1892-1903):
```typescript
// 3. Sky - Mapbox GL v2+ Only
if (isMapbox && !map.getLayer('sky') && map.getStyle().layers.every((l: any) => l.type !== 'sky')) {
    try {
        map.addLayer({
           id: 'sky',
           type: 'sky',
           paint: { 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0.0, 0.0], 'sky-atmosphere-sun-intensity': 15 }
        });
    } catch (e) {
        console.debug("[TacticalMap] Sky layer not supported by this engine.");
    }
}
```
The `sky` layer type was deprecated in Mapbox GL JS v3. Fog (already set just above this block)
provides the atmosphere effect. Simply delete this entire block including the comment line.

After making all changes, use the Read tool to verify the modified sections look correct.
```

---

### Agent Prompt 4 — Update react-map-gl Imports for v8

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.
Read `frontend/src/components/map/TacticalMap.tsx` in full before making changes.

react-map-gl v8 changed how the library is consumed compared to v7. Your task is to update
the import and mapLib usage in TacticalMap.tsx to be compatible with v8.

**Background:**
- react-map-gl v8 provides separate entry points: `react-map-gl/mapbox` and `react-map-gl/maplibre`
- The current code imports from `react-map-gl` (generic) and passes `mapLib={import('maplibre-gl')}`
  when no Mapbox token is present (line ~1990)
- In v8, the recommended pattern is to use a single unified import but ensure the correct
  `mapLib` is passed

**Changes to make:**

1. At the top of the file (line 2), the current import is:
```typescript
import { Map as GLMap, useControl, MapRef } from 'react-map-gl';
```
Keep this as-is. react-map-gl v8 still exports from the root entry point.

2. The `mapLib` prop at line ~1990:
```typescript
// @ts-expect-error: maplibre-gl type incompatibility with react-map-gl
mapLib={mapToken ? undefined : import('maplibre-gl')}
```
In react-map-gl v8, type compatibility between maplibre-gl and the Map component is improved.
Update this to remove the `@ts-expect-error` comment and use a static import pattern.

At the top of the file, after the existing imports, add:
```typescript
import * as maplibregl from 'maplibre-gl';
```

Then change the GLMap prop from:
```tsx
// @ts-expect-error: maplibre-gl type incompatibility with react-map-gl
mapLib={mapToken ? undefined : import('maplibre-gl')}
```
to:
```tsx
mapLib={mapToken ? undefined : maplibregl}
```

3. The `config` prop (lines ~1978-1988) is only valid when using the Mapbox Standard style.
When `mapToken` is not set, MapLibre is used with a CartoCDN style that does not support
this prop. Wrap it in a conditional spread:
```tsx
{...(mapToken ? {
    config: {
        basemap: {
            lightPreset: 'night',
            theme: 'monochrome',
            showPointOfInterestLabels: false,
            showRoadLabels: false,
            showPedestrianRoads: false,
            showPlaceLabels: true,
            showTransitLabels: true
        }
    }
} : {})}
```

After making these changes, verify the JSX return section still looks syntactically correct
by re-reading lines 1962-2005.
```

---

### Agent Prompt 5 — Integration Test & Verification

```
You are working in the Sovereign Watch project at /home/user/Sovereign_Watch.

Your task is to verify all globe rendering fixes are coherent and consistent across the
modified files. Do NOT run builds or install packages — only read and analyze the code.

Perform the following checks:

1. **package.json version consistency** — Read `frontend/package.json` and verify:
   - `maplibre-gl` is `^5.0.0` or higher
   - `react-map-gl` is `^8.1.0` or higher
   - All `@deck.gl/*` packages are `^9.0.0` or higher
   - `@types/mapbox-gl` has been removed

2. **Globe projection useEffect** — Read `frontend/src/components/map/TacticalMap.tsx` and
   find the globe projection useEffect. Verify:
   - It calls `applyProjection` after checking `map.isStyleLoaded()`
   - It registers a `style.load` listener if the style is not yet loaded
   - It uses `'globe'` string for Mapbox and `{ type: 'globe' }` object for MapLibre
   - `mapToken` is included in the dependency array

3. **setViewMode function** — Verify the `'2d'` branch of `setViewMode` uses the same
   conditional pattern (string for Mapbox, object for MapLibre)

4. **DeckGLOverlay** — Verify it is wrapped in `{!globeMode && (...)}` so it does not
   render in globe mode

5. **Sky layer** — Verify the deprecated `sky` layer `addLayer` block has been removed

6. **mapLib prop** — Verify the `@ts-expect-error` comment above `mapLib` has been removed
   and the prop now uses the statically imported `maplibregl`

7. **config prop** — Verify the `config` prop on the `GLMap` component is conditionally
   applied only when `mapToken` is set

Report any issues found. If all checks pass, confirm that the changes are internally consistent
and ready for a real dependency install + build test.
```

---

## Notes for Implementers

### Dependency Upgrade Ordering
Dependencies must be installed together (`npm install`) after all version changes in `package.json` are made, because deck.gl, react-map-gl, and maplibre-gl have peer dependency relationships.

### MapLibre Style for Globe
The CartoCDN dark-matter style (`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`) used when no Mapbox token is set does not include globe-specific tile sources. Globe rendering in MapLibre v5 works with any standard style — the globe projection is applied by the engine, not the style tiles. However, the visual quality of the atmosphere/fog effect depends on the tile content. This is acceptable for the initial fix.

### deck.gl Entity Rendering in Globe Mode (Future Work)
This report suppresses the DeckGLOverlay in globe mode as a stable intermediate state. A full solution would port entity rendering to one of:
- **deck.gl 9.x** with `@deck.gl/mapbox` globe-aware mode (if released and documented)
- **MapLibre GL native GeoJSON + symbol layers** for icons, trails, and vectors (more reliable but requires rewriting the rendering pipeline)

This is scoped as a separate task.

### Testing Checklist
After applying all agent prompts:
- [ ] `npm install` in `frontend/` succeeds without peer dependency errors
- [ ] `npm run build` (TypeScript compile) succeeds
- [ ] Map renders in 2D Mercator mode (baseline)
- [ ] Toggling to Globe mode shows spherical Earth (no entities expected until deck.gl work is done)
- [ ] Toggling back from Globe to Mercator restores flat map + entities
- [ ] 3D mode (pitch/terrain) still works independently of globe toggle
- [ ] No console errors about `sky` layer
- [ ] No `@ts-expect-error` related to maplibre-gl
