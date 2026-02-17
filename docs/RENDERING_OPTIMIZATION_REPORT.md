# 3D Rendering, Animation & COT Tracking Optimization Report

**Sovereign Watch — Post-Jitter-Fix Analysis**

---

## Executive Summary

The five-layer jitter fix (timestamp anchoring, arbitration cache, extrapolation cap, adaptive EWMA, trail distance gate) resolved the most visible rendering defects. This report identifies **14 remaining optimization opportunities** across three categories: animation smoothness, 3D rendering/navigation, and COT pipeline efficiency. Findings are grouped by severity and ordered by expected visual impact.

---

## Status of Previous Fixes (Verified Implemented)

| Fix                                                    | Status      | File                      | Verification                                               |
| ------------------------------------------------------ | ----------- | ------------------------- | ---------------------------------------------------------- |
| A - Timestamp anchor to `_fetched_at`                  | Implemented | `poller/main.py:327-329`  | `fetched_at = float(ac.get("_fetched_at") or time.time())` |
| B - Per-hex arbitration cache (0.8s min delta)         | Implemented | `poller/main.py:188-207`  | `_should_publish()` with `ARBI_MIN_DELTA_S = 0.8`          |
| C - Extrapolation cap at 1.0x + physics dead-reckoning | Implemented | `TacticalMap.tsx:695-711` | `t_geom` capped at 1.0, dead-reckoning after segment       |
| D - Velocity-adaptive EWMA                             | Implemented | `TacticalMap.tsx:721-724` | Speed-tiered factor: 0.10 / 0.07 / 0.04                    |
| E - Trail distance gate (30m)                          | Implemented | `TacticalMap.tsx:454-463` | `MIN_TRAIL_DIST_M = 30`                                    |

All five jitter fixes are confirmed present and correctly implemented.

---

## Part 1: Animation Smoothness — Remaining Gaps

### Finding 1.1 — EWMA Smooth Factor Is Frame-Rate Dependent (Not dt-Normalized)

**File:** `TacticalMap.tsx:714-728`
**Severity:** Medium

The EWMA position smoothing applies a fixed `SMOOTH_FACTOR` per animation frame:

```typescript
visual.lat = visual.lat + (targetLat - visual.lat) * SMOOTH_FACTOR;
visual.lon = visual.lon + (targetLon - visual.lon) * SMOOTH_FACTOR;
```

This assumes a steady 60fps (16.67ms per frame). When the browser drops frames — due to GPU load, tab throttling, background activity, or high entity counts — the convergence rate slows proportionally. A frame drop from 60fps to 30fps halves the effective smoothing speed, causing entities to lag behind their targets during load spikes and then "catch up" suddenly when frame rate recovers.

**Recommendation:** Normalize the smooth factor by frame delta time:

```typescript
const now = Date.now();
const dt = Math.min(now - lastFrameTime, 100); // cap to avoid jumps after long pauses
const dtFactor = 1 - Math.pow(1 - SMOOTH_FACTOR, dt / 16.67);
visual.lat = visual.lat + (targetLat - visual.lat) * dtFactor;
visual.lon = visual.lon + (targetLon - visual.lon) * dtFactor;
```

This produces identical behavior at 60fps but maintains correct convergence timing at any frame rate. The `Math.pow` formulation converts a per-frame alpha into a continuous-time exponential decay that is independent of sampling rate.

---

### Finding 1.2 — Altitude Not Interpolated (Z-axis Jumps)

**File:** `TacticalMap.tsx:672-731`
**Severity:** Low-Medium

The interpolation loop smooths `lat` and `lon` via the prev/curr snapshot mechanism and EWMA, but altitude is passed through raw:

```typescript
interpolated.push({ ...entity, lon: visual.lon, lat: visual.lat });
// entity.altitude is the raw value from the last COT update — never smoothed
```

Aircraft climbing or descending through altitude bands will exhibit stair-step jumps in the Z coordinate while their lat/lon movements are smooth. This is visible in two places:

- `getPosition: (d) => [d.lon, d.lat, d.altitude || 0]` on the IconLayer (line 797)
- Altitude-based color assignment via `altitudeToColor()` — color snaps between gradient stops rather than transitioning smoothly

**Recommendation:** Extend the visual state to include altitude and apply the same EWMA smoothing:

```typescript
// In visualStateRef, add alt field:
// { lon: number; lat: number; alt: number }
visual.alt = visual.alt + (entity.altitude - visual.alt) * SMOOTH_FACTOR;
interpolated.push({
  ...entity,
  lon: visual.lon,
  lat: visual.lat,
  altitude: visual.alt,
});
```

---

### Finding 1.3 — Layer Object Allocation Every Frame Generates GC Pressure

**File:** `TacticalMap.tsx:736-910`
**Severity:** Medium

Every `requestAnimationFrame` callback constructs new `PathLayer`, `IconLayer`, `ScatterplotLayer`, and `LineLayer` instances via `new`. At 60fps this produces ~300-360 layer allocations per second. Each construction allocates accessor functions, option objects, and internal state that becomes garbage on the next frame.

Deck.gl performs shallow equality checks on layer props to determine if GPU buffers need updating. Recreating layers forces it to re-run all accessors against all data points for diffing, even if nothing changed.

**Recommendation:** Separate data changes from layer configuration. The layers themselves should be constructed once (or when configuration changes), and only the `data` prop updated per frame:

```typescript
// Option A: Use overlay.setProps({ layers }) with stable layer IDs (already done)
// but also provide a stable `data` reference via useRef instead of rebuilding the
// interpolated array from scratch each frame.

// Option B: Pre-allocate layers outside the animation loop and only call
// layer.clone({ data: newData }) which is cheaper than full construction.
```

At minimum, avoid spreading the entire entity into the interpolated array (`{ ...entity, ... }`) — this creates N new objects per frame. Instead, mutate the position fields on a stable object pool.

---

### Finding 1.4 — Pulse Animation Forces Full Accessor Re-evaluation

**File:** `TacticalMap.tsx:838-858`
**Severity:** Low-Medium

The entity glow layer uses `now` in `updateTriggers`:

```typescript
updateTriggers: { getRadius: [now], getFillColor: [now] }
```

Since `now` changes every frame, deck.gl re-evaluates `getRadius` and `getFillColor` for every entity on every frame. For 400+ entities, this means 800+ accessor calls per frame just for the glow layer.

**Recommendation:** Replace per-entity CPU pulse calculation with a shader-based approach using deck.gl's `extensions` API or a custom `getFilterValue` uniform. Alternatively, use a `currentTime` uniform passed to a custom fragment shader. If staying CPU-side, at minimum scope `updateTriggers` to only change when the entity list changes, and compute the pulse inline using `Math.sin` on the shader side via the `parameters` prop.

---

### Finding 1.5 — Dead-Reckoning Anchors to `entity.lat/lon` Instead of Interpolation Endpoint

**File:** `TacticalMap.tsx:699-711`
**Severity:** Low

When elapsed time exceeds the stable duration, dead-reckoning projects forward from `entity.lat`/`entity.lon` (the last raw Kafka position):

```typescript
if (elapsed > stableDuration && entity.speed > 1.0) {
  // ...
  targetLat = entity.lat + dLat * (180 / Math.PI);
  targetLon = entity.lon + dLon * (180 / Math.PI);
}
```

This creates a discontinuity at the transition point: the geometric interpolation ends at `curr.lat`/`curr.lon`, but dead-reckoning jumps to `entity.lat` + projection. If `curr` and `entity` differ (they can, since `curr` is from the snapshot and `entity` is the latest state), there's a seam.

**Recommendation:** Dead-reckoning should project forward from the geometric interpolation endpoint (`curr.lon`/`curr.lat`), not from `entity.lon`/`entity.lat`:

```typescript
if (elapsed > stableDuration && entity.speed > 1.0) {
  const overrun = Math.min(elapsed - stableDuration, 5000) / 1000;
  // Project from curr (the interpolation endpoint), not entity
  targetLat = curr.lat + dLat * (180 / Math.PI);
  targetLon = curr.lon + dLon * (180 / Math.PI);
}
```

---

### Finding 1.6 — Course Smoothing Should Use dt-Normalized lerp

**File:** `TacticalMap.tsx:533`
**Severity:** Low

The heading lerp uses a fixed factor of 0.35 per update:

```typescript
const smoothedCourse =
  prevCourse != null ? lerpAngle(prevCourse, courseToLerp, 0.35) : courseToLerp;
```

This is applied in the entity_update handler (not the animation loop), so it runs at the data update rate (~1/s per entity after arbitration). This is reasonable, but the convergence time depends on the actual update rate — if a source sends faster, heading converges faster. A dt-normalized lerp would produce consistent turn rates.

---

## Part 2: 3D Rendering & Navigation

### Finding 2.1 — No 3D Terrain Layer (Pitch Without Depth)

**File:** `TacticalMap.tsx:940-947`
**Severity:** High (for 3D experience)

The 3D view sets `pitch: 45` but renders over a flat tile map. Without terrain, the 3D perspective provides no depth cues — aircraft at FL350 appear at the same visual plane as those on final approach at 2,000ft. The altitude information exists in the data (`entity.altitude`) and is passed to layer positions (`[d.lon, d.lat, d.altitude || 0]`), but flat terrain makes altitude indistinguishable.

**Recommendation:** MapLibre 3.x supports terrain via a DEM (Digital Elevation Model) raster source:

```typescript
// After map loads:
mapRef.current.addSource("terrain", {
  type: "raster-dem",
  url: "https://demotiles.maplibre.org/terrain-tiles/tiles.json",
  tileSize: 256,
});
mapRef.current.setTerrain({ source: "terrain", exaggeration: 1.5 });
```

This gives physical ground contours that make aircraft altitude separation immediately visible. Combined with the existing altitude color gradient, this transforms the 3D view from decorative tilt to meaningful spatial visualization.

For the open-source (no Mapbox token) path, MapTiler and Terrain RGB tiles are compatible alternatives.

---

### Finding 2.2 — No Atmospheric Fog for Depth Perception

**File:** `TacticalMap.tsx:997-1038`
**Severity:** Medium

At `pitch: 45` with a wide radius (150nm), the far edge of the map renders at the same brightness and contrast as the near edge. Without atmospheric scattering, there's no visual depth cue for distance, making it hard to judge which entities are nearby vs. far away.

**Recommendation:** MapLibre 3.x supports atmospheric fog:

```typescript
map.setFog({
  range: [0.5, 10], // fog starts at 50% of view, full at 10x
  color: "rgba(10, 15, 25, 1)", // dark theme compatible
  "horizon-blend": 0.1,
  "high-color": "rgba(20, 30, 50, 1)",
  "space-color": "rgba(5, 5, 15, 1)",
});
```

This provides natural depth attenuation that works with the dark theme and makes near/far entity separation intuitive.

---

### Finding 2.3 — Deck.gl Z-Coordinate Not Configured for Metric Altitude

**File:** `TacticalMap.tsx:787-858`
**Severity:** Medium

Layer positions include altitude as Z: `[d.lon, d.lat, d.altitude || 0]`. However, deck.gl's default coordinate system (`COORDINATE_SYSTEM.LNGLAT`) interprets Z as meters in the common-space projection, but the actual rendering depends on the `coordinateOrigin` and whether the map's projection handles the Z correctly in interleaved mode.

Without explicit configuration, aircraft at FL350 (10,668m) may not visually separate from those at ground level when viewed from the side. The Z-value is technically present but its visual impact is projection-dependent.

**Recommendation:** Verify Z separation by testing with two entities at dramatically different altitudes (e.g., 0m and 10,000m) at the same lat/lon. If they overlap visually at pitch=45, configure the `MapboxOverlay` with explicit `useDevicePixels` and ensure the map's projection properly handles elevation. Consider adding `ColumnLayer` altitude pillars for the selected entity to visualize its height above terrain.

---

### Finding 2.4 — Camera Transition Uses Only `flyTo` (No Easing Control)

**File:** `TacticalMap.tsx:284-290, 940-947`
**Severity:** Low

All camera movements use MapLibre's `flyTo()` with a fixed duration:

```typescript
mapRef.current.flyTo({
  center: [lon, lat],
  zoom: calculateZoom(radius),
  duration: 2000,
});
```

This produces MapLibre's default easing curve. For tactical use cases, different movements warrant different easing:

- Mission area changes: ease-in-out (current default) is appropriate
- "Follow entity" mode: linear tracking with no easing
- 2D/3D toggle: ease-out (fast start, gentle stop) feels more responsive

**Recommendation:** Add an `easing` parameter to camera transitions:

```typescript
mapRef.current.flyTo({
  center: [lon, lat],
  zoom: calculateZoom(radius),
  duration: 2000,
  easing: (t) => 1 - Math.pow(1 - t, 3), // ease-out cubic
});
```

Also consider adding a "follow selected entity" camera mode that uses `easeTo()` with short durations (~200ms) to track the selected aircraft's interpolated position each frame.

---

### Finding 2.5 — No Bearing Rotation for 3D Navigation

**File:** `TacticalMap.tsx:940-947`
**Severity:** Low

The 3D toggle sets `pitch: 45, bearing: 0`. North is always up. For tracking a specific aircraft, rotating the bearing to align with the entity's course provides a more intuitive "chase cam" perspective that makes turn prediction and spatial relationships clearer.

**Recommendation:** When an entity is selected and the view is in 3D mode, optionally animate bearing to match the entity's course:

```typescript
if (mode === "3d" && selectedEntity) {
  mapRef.current.flyTo({
    center: [selectedEntity.lon, selectedEntity.lat],
    pitch: 50,
    bearing: selectedEntity.course,
    duration: 1500,
  });
}
```

This should be opt-in (a "track" button) rather than automatic to avoid disorienting the user.

---

### Finding 2.6 — deck.gl Version 8.9 Missing Modern Transition Features

**File:** `package.json:13-17`
**Severity:** Medium

The project uses `@deck.gl/*: ^8.9.0`. The current stable release is deck.gl 9.x, which includes:

- **GPU-accelerated data transitions** via the `transitions` layer prop — smooths position, color, and size changes on the GPU without CPU-side EWMA
- **WebGPU backend** for 2-4x rendering throughput
- **Improved MapboxOverlay interleaving** with better depth buffer sharing
- **`CollisionFilterExtension`** for automatic icon/label decluttering at high entity density

**Recommendation:** Evaluate upgrading to deck.gl 9.x. The `transitions` prop alone could replace the manual EWMA position smoothing with a single layer configuration:

```typescript
new IconLayer({
  // ...existing props
  transitions: {
    getPosition: { duration: 300, easing: d3.easeCubicOut },
    getAngle: { duration: 500 },
  },
});
```

This moves interpolation to the GPU and eliminates the per-entity CPU smoothing loop.

**Risk:** deck.gl 9.x has breaking API changes in layer construction and coordinate system handling. The `@deck.gl/mapbox` interleaving API changed. This is a moderate-effort migration.

---

## Part 3: COT Tracking Pipeline

### Finding 3.1 — Worker Sends Individual Messages, Not Batches

**File:** `tak.worker.ts:34-66`
**Severity:** Medium

Each WebSocket message results in exactly one `self.postMessage({ type: 'entity_update', data: object })`. At peak load (400+ aircraft in a 150nm radius, updates arriving every 0.8s per entity via the arbitration cache), the main thread receives ~500 `onmessage` events per second from the worker.

Each `postMessage` triggers a structured clone of the entire decoded object, a microtask queue entry, and a main-thread event handler invocation. The overhead is dominated by the structured clone serialization, not the message content.

**Recommendation:** Batch decoded entities in the worker and flush them at a fixed interval (e.g., every 50ms or every 10 messages, whichever comes first):

```typescript
let batch: any[] = [];
let flushTimer: number | null = null;

function flush() {
  if (batch.length > 0) {
    self.postMessage({ type: "entity_batch", data: batch });
    batch = [];
  }
  flushTimer = null;
}

// In decode_batch handler:
batch.push(object);
if (batch.length >= 10) {
  flush();
} else if (!flushTimer) {
  flushTimer = self.setTimeout(flush, 50);
}
```

This reduces main-thread interrupt frequency by 10x while adding at most 50ms latency (well within the interpolation smoothing window).

---

### Finding 3.2 — No Transferable Objects on Worker-to-Main Path

**File:** `tak.worker.ts:60`, `TacticalMap.tsx:586-589`
**Severity:** Low

The WebSocket-to-Worker path correctly uses transferable objects:

```typescript
workerRef.current.postMessage({ type: "decode_batch", payload: event.data }, [
  event.data,
]);
```

But the Worker-to-Main path does not:

```typescript
self.postMessage({ type: "entity_update", data: object }); // structured clone, not transfer
```

The `object` from `takType.toObject()` is a plain JS object and cannot be transferred (only ArrayBuffers, MessagePorts, etc. are transferable). However, if the worker serialized the decoded data into a `Float64Array` (lat, lon, alt, course, speed, time) + metadata, that buffer could be transferred zero-copy.

**Recommendation:** For the current architecture, this is a minor optimization. It becomes meaningful if entity counts exceed 1,000 or if the batching from Finding 3.1 is implemented (larger payloads benefit more from zero-copy transfer).

---

### Finding 3.3 — Entity Map Iteration Performs Full Scan Every Frame

**File:** `TacticalMap.tsx:637-731`
**Severity:** Low-Medium (scales with entity count)

The animation loop iterates all entities three times per frame:

1. Stale cleanup scan (lines 637-654)
2. Count update scan (lines 657-665)
3. Interpolation + layer data build (lines 674-731)

For 400 entities at 60fps, this is 72,000 map iterations per second. Each iteration involves property access on the entity object and conditional logic.

**Recommendation:** Combine the three passes into a single iteration:

```typescript
let airCount = 0,
  seaCount = 0;
const toDelete: string[] = [];

for (const [uid, entity] of entities) {
  const isShip = entity.type?.includes("S");
  const threshold = isShip ? STALE_THRESHOLD_SEA_MS : STALE_THRESHOLD_AIR_MS;

  if (now - entity.lastSeen > threshold) {
    toDelete.push(uid);
    continue;
  }

  isShip ? seaCount++ : airCount++;

  if (isShip && !filters?.showSea) continue;
  if (!isShip && !filters?.showAir) continue;

  // ... interpolation logic
  interpolated.push(/* ... */);
}

// Cleanup after iteration (don't delete during)
for (const uid of toDelete) {
  /* cleanup */
}
```

This halves the iteration count and improves cache locality.

---

### Finding 3.4 — Arbitration Cache Distance Bypass Disabled But Still Has Code

**File:** `poller/main.py:188-207`
**Severity:** Informational

The `_should_publish` method's docstring mentions "Distance bypass is disabled" and the `ARBI_MIN_DIST_M` constant is defined (line 39) but never used:

```python
ARBI_MIN_DIST_M = 50.0  # defined but unused

def _should_publish(self, hex_id, source_ts, lat, lon):
    # ... only checks time delta, never distance
```

This is intentional (the analysis showed distance bypass allowed multi-source jitter), but the dead code and parameter (`lat`, `lon` accepted but unused) create confusion.

**Recommendation:** Either remove `ARBI_MIN_DIST_M` and the lat/lon parameters from `_should_publish`, or document why they're retained for future use.

---

## Part 4: MapScene.tsx Reference Pattern Comparison

The provided `MapScene.tsx` snippet uses the **controlled viewState** pattern:

```typescript
const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
const handleViewStateChange = useCallback(
  ({ viewState: nextViewState }) => setViewState(nextViewState),
  [],
);
// <DeckGL viewState={viewState} onViewStateChange={handleViewStateChange}>
```

The production `TacticalMap.tsx` correctly uses the **uncontrolled** pattern:

```typescript
<GLMap initialViewState={{...}} />  // no viewState state variable
```

The production approach is preferable because:

1. It avoids a React re-render on every pan/zoom frame (60+ setState calls/sec)
2. MapLibre handles its own animation loop internally with better frame timing
3. The `MapboxOverlay` interleaved mode shares the same WebGL context, so DeckGL layers render in the map's own RAF cycle

**No changes needed here** — the production code already uses the better pattern compared to the reference snippet.

---

## Priority Matrix

| #   | Finding                        | Category     | Impact  | Effort | Priority |
| --- | ------------------------------ | ------------ | ------- | ------ | -------- |
| 2.1 | 3D Terrain layer               | Navigation   | High    | Low    | **P0**   |
| 1.1 | dt-normalized EWMA             | Animation    | Medium  | Low    | **P1**   |
| 1.3 | Layer allocation / GC pressure | Animation    | Medium  | Medium | **P1**   |
| 3.1 | Worker message batching        | COT Pipeline | Medium  | Low    | **P1**   |
| 2.2 | Atmospheric fog                | Navigation   | Medium  | Low    | **P1**   |
| 2.6 | deck.gl 9.x upgrade            | Rendering    | Medium  | High   | **P2**   |
| 1.2 | Altitude interpolation         | Animation    | Low-Med | Low    | **P2**   |
| 2.3 | Z-coordinate metric config     | Navigation   | Medium  | Medium | **P2**   |
| 1.4 | Pulse animation GPU offload    | Animation    | Low-Med | Medium | **P2**   |
| 1.5 | Dead-reckoning anchor point    | Animation    | Low     | Low    | **P2**   |
| 3.3 | Single-pass entity iteration   | COT Pipeline | Low-Med | Low    | **P2**   |
| 2.4 | Camera easing control          | Navigation   | Low     | Low    | **P3**   |
| 2.5 | Bearing rotation in 3D         | Navigation   | Low     | Low    | **P3**   |
| 3.4 | Dead code cleanup              | Maintenance  | Info    | Low    | **P3**   |

---

## Recommended Implementation Order

**Phase 1 — Immediate wins (no architectural changes):**

1. Add 3D terrain source (Finding 2.1) — single most impactful visual change
2. Add atmospheric fog (Finding 2.2) — 5 lines of code, immediate depth improvement
3. dt-normalize the EWMA (Finding 1.1) — fixes frame-rate-dependent smoothing
4. Fix dead-reckoning anchor (Finding 1.5) — one-line change, eliminates seam
5. Add altitude to visual state (Finding 1.2) — extends existing EWMA pattern

**Phase 2 — Performance optimization:** 6. Batch worker messages (Finding 3.1) — reduces main-thread pressure 7. Combine entity iteration passes (Finding 3.3) — halves CPU work per frame 8. Reduce layer allocations (Finding 1.3) — reduces GC pressure

**Phase 3 — Feature enhancements:** 9. Camera easing + follow mode (Findings 2.4, 2.5) 10. Evaluate deck.gl 9.x migration (Finding 2.6)

---

_Report generated from source analysis of Sovereign Watch v0.3.0_
_Analyzed files: TacticalMap.tsx (1099 lines), poller/main.py (405 lines), multi_source_poller.py (205 lines), tak.worker.ts (72 lines), types.ts (18 lines), package.json_
