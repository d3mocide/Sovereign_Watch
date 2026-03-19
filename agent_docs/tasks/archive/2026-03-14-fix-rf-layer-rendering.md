# RF Layer Not Rendering on Map

**Date:** 2026-03-14  
**Status:** Fixed

## Issue

RF repeater sites were fetched successfully by `useRFSites` (confirmed via the intelligence stream notification counting correct site numbers), but no markers ever appeared on the map. Sea cable landing station scatter plots (rendered via `buildInfraLayers`) worked fine, providing a clear comparison baseline.

## Root Cause

`rfSitesRef` was declared in `TacticalMap`'s props interface and destructured correctly (line 152), but was **never passed into the `useAnimationLoop` call** (lines 472–531). 

Inside `useAnimationLoop`, the RF layer builder is guarded by:
```ts
if (showRepeaters && rfSitesRef && rfSitesRef.current.length > 0) {
  repeaterLayers = buildRFLayers(...);
}
```

Because `rfSitesRef` arrived as `undefined` in the hook, the guard short-circuited every single animation frame — `repeaterLayers` was always `[]`. The sites weren't under the map or under the outages layer; they were simply never built.

**Why landing stations work differently:** `stationsData` is a plain JSON prop passed through to `buildInfraLayers` — no ref required. RF sites use a `MutableRefObject` pattern (to avoid re-renders on data updates), which means the ref itself must be explicitly threaded through every call boundary.

## Solution

Added the single missing line in `TacticalMap.tsx` at the `useAnimationLoop` call site:

```ts
// Before (missing rfSitesRef entirely):
    kiwiNodeRef,
    showRepeaters,

// After:
    kiwiNodeRef,
    rfSitesRef,   // ← was missing
    showRepeaters,
```

## Changes

| File | Change |
|------|--------|
| `frontend/src/components/map/TacticalMap.tsx` | Added `rfSitesRef,` to `useAnimationLoop` call (line ~526) |

## Verification

- `npm run lint` — passes clean
- HMR reloads on save; RF site markers (emerald dots for FM, violet for digital, amber for public safety, sky for NOAA NWR) now appear on the tactical map when the repeaters layer is toggled on
- Clustering at low zoom levels works correctly
- Hover tooltips and click-to-select function as expected

## Benefits

- RF repeater locations now render correctly on both 2D Mercator and Globe projections
- No performance impact — the fix is a single missing argument, no logic changes
- Aligns the RF layer wire-up pattern with `js8StationsRef` / `kiwiNodeRef` which are threaded through the same path
