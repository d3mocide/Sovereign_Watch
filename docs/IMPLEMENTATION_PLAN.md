# Rendering Optimization — Implementation Plan

**Prerequisite:** Read `RENDERING_OPTIMIZATION_REPORT.md` for full context on each finding.

This plan is organized into 10 discrete steps. Each step is self-contained, buildable, and testable. Steps 1-5 are Phase 1 (immediate wins), Steps 6-8 are Phase 2 (performance), Steps 9-10 are Phase 3 (features).

---

## Files That Will Be Modified

| File                                          | Steps               | Nature of Changes                                     |
| --------------------------------------------- | ------------------- | ----------------------------------------------------- |
| `frontend/src/components/map/TacticalMap.tsx` | 1, 2, 3, 4, 5, 7, 9 | Animation loop, visual state, map setup, layer config |
| `frontend/src/workers/tak.worker.ts`          | 6                   | Message batching                                      |
| `frontend/src/types.ts`                       | —                   | No changes needed (CoTEntity already has altitude)    |
| `backend/ingestion/poller/main.py`            | 8                   | Dead code cleanup                                     |

---

## Step 1: dt-Normalize the EWMA Smooth Factor

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Goal:** Make position smoothing frame-rate independent so dropped frames don't cause lag/catch-up artifacts.

### 1a. Add a `lastFrameTimeRef` next to existing refs (after line 225)

Add a new ref to track the previous frame timestamp:

```typescript
const lastFrameTimeRef = useRef<number>(Date.now());
```

Place it directly after the `visualStateRef` declaration on line 225.

### 1b. Compute frame delta at the top of the animation loop (after line 633)

Inside the `animate` function, immediately after `const now = Date.now();` on line 633, add:

```typescript
const dt = Math.min(now - lastFrameTimeRef.current, 100); // cap at 100ms to avoid jumps after tab switch
lastFrameTimeRef.current = now;
```

### 1c. Replace the fixed EWMA application with dt-normalized version (lines 721-726)

Replace the current EWMA block:

```typescript
// CURRENT (lines 721-726):
const speedKts = entity.speed * 1.94384;
const SMOOTH_FACTOR = speedKts > 200 ? 0.1 : speedKts > 50 ? 0.07 : 0.04;
visual.lat = visual.lat + (targetLat - visual.lat) * SMOOTH_FACTOR;
visual.lon = visual.lon + (targetLon - visual.lon) * SMOOTH_FACTOR;
```

With:

```typescript
// dt-normalized EWMA: identical behavior at 60fps, correct at any fps
const speedKts = entity.speed * 1.94384;
const BASE_ALPHA = speedKts > 200 ? 0.1 : speedKts > 50 ? 0.07 : 0.04;
const smoothFactor = 1 - Math.pow(1 - BASE_ALPHA, dt / 16.67);
visual.lat = visual.lat + (targetLat - visual.lat) * smoothFactor;
visual.lon = visual.lon + (targetLon - visual.lon) * smoothFactor;
```

### 1d. Reset `lastFrameTimeRef` when entities are cleared (line 387 area)

In the mission-change cleanup effect (the `useEffect` starting at line 377), add after the `currSnapshotsRef.current.clear();` line:

```typescript
lastFrameTimeRef.current = Date.now();
```

This prevents a stale dt calculation after a mission area change.

---

## Step 2: Add Altitude Interpolation to Visual State

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Goal:** Smooth altitude transitions so Z-position and altitude-based colors don't stair-step.

### 2a. Change the visualStateRef type (line 225)

Replace:

```typescript
const visualStateRef = useRef<Map<string, { lon: number; lat: number }>>(
  new Map(),
);
```

With:

```typescript
const visualStateRef = useRef<
  Map<string, { lon: number; lat: number; alt: number }>
>(new Map());
```

### 2b. Update visual state initialization (lines 715-716)

Replace:

```typescript
if (!visual) {
    visual = { lat: targetLat, lon: targetLon };
```

With:

```typescript
if (!visual) {
    visual = { lat: targetLat, lon: targetLon, alt: entity.altitude };
```

### 2c. Add altitude smoothing after the lon smoothing (after line 726)

After the `visual.lon = ...` line, add:

```typescript
visual.alt = visual.alt + (entity.altitude - visual.alt) * smoothFactor;
```

Note: This uses the same `smoothFactor` from Step 1c. If Step 1 has not been applied yet, use `SMOOTH_FACTOR` instead.

### 2d. Include smoothed altitude in interpolated output (line 730)

Replace:

```typescript
interpolated.push({ ...entity, lon: visual.lon, lat: visual.lat });
```

With:

```typescript
interpolated.push({
  ...entity,
  lon: visual.lon,
  lat: visual.lat,
  altitude: visual.alt,
});
```

---

## Step 3: Fix Dead-Reckoning Anchor Point

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Goal:** Eliminate the position seam at the geometric-to-dead-reckoning transition boundary.

### 3a. Change the dead-reckoning base coordinates (lines 705, 709-710)

Replace the dead-reckoning block (lines 699-711):

```typescript
// CURRENT:
if (elapsed > stableDuration && entity.speed > 1.0) {
  const overrun = Math.min(elapsed - stableDuration, 5000) / 1000;
  const courseRad = ((entity.course || 0) * Math.PI) / 180;
  const R = 6_371_000;
  const latRad = (entity.lat * Math.PI) / 180;
  const distM = entity.speed * overrun;
  const dLat = (distM * Math.cos(courseRad)) / R;
  const dLon = (distM * Math.sin(courseRad)) / (R * Math.cos(latRad));
  targetLat = entity.lat + dLat * (180 / Math.PI);
  targetLon = entity.lon + dLon * (180 / Math.PI);
}
```

With:

```typescript
// FIXED: Project from interpolation endpoint (curr), not raw entity position
if (elapsed > stableDuration && entity.speed > 1.0) {
  const overrun = Math.min(elapsed - stableDuration, 5000) / 1000;
  const courseRad = ((entity.course || 0) * Math.PI) / 180;
  const R = 6_371_000;
  const latRad = (curr.lat * Math.PI) / 180;
  const distM = entity.speed * overrun;
  const dLat = (distM * Math.cos(courseRad)) / R;
  const dLon = (distM * Math.sin(courseRad)) / (R * Math.cos(latRad));
  targetLat = curr.lat + dLat * (180 / Math.PI);
  targetLon = curr.lon + dLon * (180 / Math.PI);
}
```

The changes are on lines 705 (latRad), 709 (targetLat), and 710 (targetLon): `entity.lat`/`entity.lon` becomes `curr.lat`/`curr.lon`.

---

## Step 4: Add 3D Terrain Layer

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Goal:** Add a DEM terrain source so the 3D view has actual ground contours, making aircraft altitude visually meaningful.

### 4a. Add an `onLoad` handler to the GLMap component (around line 997-1015)

Add a `useCallback` handler before the return statement (e.g., after `handleOverlayLoaded` at line 991):

```typescript
const handleMapLoad = useCallback(() => {
  const map = mapRef.current?.getMap();
  if (!map) return;

  // Add terrain source for 3D depth
  if (!map.getSource("terrain-dem")) {
    map.addSource("terrain-dem", {
      type: "raster-dem",
      tiles: [
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
      ],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
    });
    map.setTerrain({ source: "terrain-dem", exaggeration: 1.5 });
  }

  // Add atmospheric fog for depth perception
  map.setFog({
    range: [0.5, 10],
    color: "rgba(10, 15, 25, 1)",
    "high-color": "rgba(20, 30, 50, 1)",
    "space-color": "rgba(5, 5, 15, 1)",
    "horizon-blend": 0.1,
  });
}, []);
```

### 4b. Wire the handler to the GLMap

On the `<GLMap>` component (line 997), add the `onLoad` prop:

```tsx
<GLMap
    ref={mapRef}
    onLoad={handleMapLoad}
    initialViewState={{
```

### 4c. Update the 3D view mode pitch

In the `setViewMode` function (line 940-947), increase the 3D pitch slightly for better terrain visibility:

Replace:

```typescript
mapRef.current.flyTo({ pitch: 45, bearing: 0, duration: 2000 });
```

With:

```typescript
mapRef.current.flyTo({
  pitch: 50,
  bearing: 0,
  duration: 2000,
  easing: (t: number) => 1 - Math.pow(1 - t, 3),
});
```

Also update the 2D transition with easing:

```typescript
mapRef.current.flyTo({
  pitch: 0,
  bearing: 0,
  duration: 1500,
  easing: (t: number) => 1 - Math.pow(1 - t, 3),
});
```

---

## Step 5: Add Atmospheric Fog for Depth Perception

**Included in Step 4a** — the `handleMapLoad` callback already contains the `map.setFog()` call. No additional work needed if Step 4 is applied.

If Step 4 is applied without terrain (e.g., due to tile source issues), the fog section can be kept standalone — it works independently.

---

## Step 6: Batch Worker Messages

**File:** `frontend/src/workers/tak.worker.ts`
**Goal:** Reduce main-thread interrupt frequency by batching decoded COT entities.

### 6a. Add batch state variables at the top of the worker (after line 4)

After the `let takType: Type | null = null;` line, add:

```typescript
// Batching: accumulate decoded entities and flush periodically
let batch: any[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 50;

function flushBatch() {
  if (batch.length > 0) {
    self.postMessage({ type: "entity_batch", data: batch });
    batch = [];
  }
  flushTimer = null;
}
```

### 6b. Replace the individual postMessage with batch accumulation (line 60)

Replace:

```typescript
self.postMessage({ type: "entity_update", data: object });
```

With:

```typescript
batch.push(object);
if (batch.length >= BATCH_SIZE) {
  flushBatch();
} else if (!flushTimer) {
  flushTimer = setTimeout(flushBatch, FLUSH_INTERVAL_MS);
}
```

### 6c. Update the main thread handler in TacticalMap.tsx (lines 413-549)

In `worker.onmessage`, add a handler for the new `entity_batch` message type. The existing `entity_update` handler should remain for backwards compatibility. Add this block right after the `if (type === 'status'...)` check at line 415:

```typescript
if (type === "entity_batch") {
  // Process batched entities
  for (const item of data) {
    processEntityUpdate(item);
  }
  return;
}
```

Then **extract the entity processing logic** from the existing `if (type === 'entity_update')` block (lines 418-549) into a standalone function. Define it inside the `useEffect` closure, before `worker.onmessage`:

```typescript
const processEntityUpdate = (updateData: any) => {
  const entity = updateData.cotEvent;
  if (!entity || !entity.uid) return;
  // ... (move all existing logic from lines 420-548 here, unchanged)
};
```

Then simplify the existing handler:

```typescript
if (type === "entity_update") {
  processEntityUpdate(data);
}
```

**Important:** The extracted `processEntityUpdate` function must remain inside the `useEffect` closure so it has access to `entitiesRef`, `knownUidsRef`, `currentMissionRef`, `prevSnapshotsRef`, `currSnapshotsRef`, `prevCourseRef`, and `onEvent`.

---

## Step 7: Combine Entity Iteration Passes Into Single Loop

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Goal:** Merge stale cleanup, counting, and interpolation into one iteration to halve CPU work.

### 7a. Replace the three separate loops (lines 631-731) with a single combined loop

Replace the entire section from `// 1. Cleanup stale entities` through the end of `// 3. Interpolate` (lines 631-731) with:

```typescript
// Combined pass: cleanup, count, and interpolate in a single iteration
const entities = entitiesRef.current;
const now = Date.now();
const dt = Math.min(now - lastFrameTimeRef.current, 100);
lastFrameTimeRef.current = now;

const STALE_THRESHOLD_AIR_MS = 120 * 1000;
const STALE_THRESHOLD_SEA_MS = 300 * 1000;

let airCount = 0;
let seaCount = 0;
const staleUids: string[] = [];
const interpolated: CoTEntity[] = [];

for (const [uid, entity] of entities) {
  const isShip = entity.type?.includes("S");
  const threshold = isShip ? STALE_THRESHOLD_SEA_MS : STALE_THRESHOLD_AIR_MS;

  // Stale check
  if (now - entity.lastSeen > threshold) {
    staleUids.push(uid);
    continue;
  }

  // Count
  if (isShip) {
    seaCount++;
  } else {
    airCount++;
  }

  // Filter
  if (isShip && !filters?.showSea) continue;
  if (!isShip && !filters?.showAir) continue;

  // Interpolate
  const prev = prevSnapshotsRef.current.get(uid);
  const curr = currSnapshotsRef.current.get(uid);

  let targetLon = entity.lon;
  let targetLat = entity.lat;

  if (prev && curr && curr.ts > prev.ts) {
    const elapsed = now - curr.ts;
    const rawDuration = curr.ts - prev.ts;
    const stableDuration = Math.max(rawDuration, 1000);

    const t_geom = Math.min(elapsed / stableDuration, 1.0);
    targetLon = prev.lon + (curr.lon - prev.lon) * t_geom;
    targetLat = prev.lat + (curr.lat - prev.lat) * t_geom;

    if (elapsed > stableDuration && entity.speed > 1.0) {
      const overrun = Math.min(elapsed - stableDuration, 5000) / 1000;
      const courseRad = ((entity.course || 0) * Math.PI) / 180;
      const R = 6_371_000;
      const latRad = (curr.lat * Math.PI) / 180;
      const distM = entity.speed * overrun;
      const dLat = (distM * Math.cos(courseRad)) / R;
      const dLon = (distM * Math.sin(courseRad)) / (R * Math.cos(latRad));
      targetLat = curr.lat + dLat * (180 / Math.PI);
      targetLon = curr.lon + dLon * (180 / Math.PI);
    }
  }

  let visual = visualStateRef.current.get(uid);
  if (!visual) {
    visual = { lat: targetLat, lon: targetLon, alt: entity.altitude };
  } else {
    const speedKts = entity.speed * 1.94384;
    const BASE_ALPHA = speedKts > 200 ? 0.1 : speedKts > 50 ? 0.07 : 0.04;
    const smoothFactor = 1 - Math.pow(1 - BASE_ALPHA, dt / 16.67);
    visual.lat = visual.lat + (targetLat - visual.lat) * smoothFactor;
    visual.lon = visual.lon + (targetLon - visual.lon) * smoothFactor;
    visual.alt = visual.alt + (entity.altitude - visual.alt) * smoothFactor;
  }
  visualStateRef.current.set(uid, visual);

  interpolated.push({
    ...entity,
    lon: visual.lon,
    lat: visual.lat,
    altitude: visual.alt,
  });
}

// Deferred stale cleanup (don't delete during iteration)
for (const uid of staleUids) {
  const entity = entities.get(uid);
  if (entity) {
    const isShip = entity.type?.includes("S");
    onEvent?.({
      type: "lost",
      message: `${isShip ? "🚢" : "✈️"} ${entity.callsign}`,
      entityType: isShip ? "sea" : "air",
    });
  }
  entities.delete(uid);
  knownUidsRef.current.delete(uid);
  prevCourseRef.current.delete(uid);
  prevSnapshotsRef.current.delete(uid);
  currSnapshotsRef.current.delete(uid);
  visualStateRef.current.delete(uid);
}

if (countsRef.current.air !== airCount || countsRef.current.sea !== seaCount) {
  countsRef.current = { air: airCount, sea: seaCount };
  onCountsUpdate?.({ air: airCount, sea: seaCount });
}
```

**Note:** This combined block incorporates Steps 1 (dt-normalized EWMA), 2 (altitude smoothing), and 3 (dead-reckoning anchor fix). If applying Step 7 alone without Steps 1-3, use the original EWMA and dead-reckoning code instead.

### 7b. Remove the now-redundant lines

The old `// 1. Cleanup stale entities`, `// 2. Report counts`, and `// 3. Interpolate` sections (lines 631-731) are fully replaced by the block above. Ensure the `// 4. Update Layers` section starting at line 733 remains untouched.

---

## Step 8: Clean Up Dead Code in Arbitration Cache

**File:** `backend/ingestion/poller/main.py`
**Goal:** Remove unused constant and simplify method signatures.

### 8a. Remove unused `ARBI_MIN_DIST_M` constant (line 39)

Delete:

```python
ARBI_MIN_DIST_M = 50.0
```

### 8b. Remove unused `lat`/`lon` parameters from `_should_publish` (line 188)

Replace:

```python
def _should_publish(self, hex_id: str, source_ts: float, lat: float, lon: float) -> bool:
```

With:

```python
def _should_publish(self, hex_id: str, source_ts: float) -> bool:
```

### 8c. Update the call site (line 301)

Replace:

```python
if not self._should_publish(hex_id, source_ts, msg_lat, msg_lon):
```

With:

```python
if not self._should_publish(hex_id, source_ts):
```

---

## Step 9: Camera Easing for View Transitions

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Goal:** Use ease-out cubic for more responsive-feeling camera transitions.

### 9a. Update all `flyTo` calls with easing

There are 5 `flyTo` calls in the file. Update each with an easing function appropriate to the context:

**Mission area change (line 286-290):**

```typescript
mapRef.current.flyTo({
  center: [lon, lat],
  zoom: calculateZoom(radius),
  duration: 2000,
  easing: (t: number) => 1 - Math.pow(1 - t, 3),
});
```

**Radius preset change (line 308-310):**

```typescript
mapRef.current.flyTo({
  zoom: calculateZoom(radius),
  duration: 1000,
  easing: (t: number) => 1 - Math.pow(1 - t, 3),
});
```

**Mission sync on mount (line 358-362):**

```typescript
mapRef.current.flyTo({
  center: [mission.lon, mission.lat],
  zoom: calculateZoom(mission.radius_nm),
  duration: 2000,
  easing: (t: number) => 1 - Math.pow(1 - t, 3),
});
```

**2D/3D toggle (lines 943, 945):** Already updated in Step 4c.

---

## Step 10: Verify TypeScript Compilation

After all changes, run the build to confirm no type errors were introduced:

```bash
cd frontend && npx tsc --noEmit
```

Expected potential issues:

- The `visual.alt` field added in Step 2a changes the Map type — ensure all places that create or read from `visualStateRef` are updated consistently.
- The `curr.lat` / `curr.lon` usage in Step 3 is safe because the dead-reckoning block is inside `if (prev && curr && curr.ts > prev.ts)`, so `curr` is guaranteed non-null.
- The worker batch type may need an explicit `any[]` annotation.

---

## Dependency Graph

```
Step 1 (dt-normalize EWMA) ─┐
Step 2 (altitude smoothing) ─┼── Step 7 (combined loop — incorporates 1, 2, 3)
Step 3 (dead-reckoning fix) ─┘

Step 4 (terrain + fog) ← standalone, no deps
Step 5 ← included in Step 4

Step 6 (worker batching) ← standalone, no deps

Step 7 (combined loop) ← depends on Steps 1, 2, 3

Step 8 (backend cleanup) ← standalone, no deps

Step 9 (camera easing) ← standalone, partially overlaps Step 4c

Step 10 (type check) ← depends on all prior steps
```

**Recommended execution order:** 4 → 6 → 8 → 7 (which includes 1+2+3) → 9 → 10

This order front-loads independent changes (terrain, worker batching, backend cleanup), then applies the combined animation loop rewrite, then finishes with camera polish and verification.

---

## Agent Execution Prompt

Copy the following prompt to instruct an agent to execute this plan:

---

```
You are implementing rendering optimizations for the Sovereign Watch tactical map application.

PLAN FILE: docs/IMPLEMENTATION_PLAN.md

Read the full implementation plan at the path above. Execute all 10 steps in this order:
Step 4, Step 6, Step 8, Step 7, Step 9, Step 10.

Step 7 is a combined rewrite that incorporates Steps 1, 2, 3, and 5 is included in Step 4.

FILES TO MODIFY:
1. frontend/src/components/map/TacticalMap.tsx — Steps 4, 7, 9
2. frontend/src/workers/tak.worker.ts — Step 6
3. backend/ingestion/poller/main.py — Step 8

CRITICAL RULES:
- Read each file FULLY before making any edits
- Make targeted edits — do not rewrite sections you are not changing
- Preserve all existing eslint-disable comments, they are intentional
- Do not add new comments beyond what the plan specifies
- Do not change import statements unless the plan explicitly says to
- After all edits, run: cd /home/user/Sovereign_Watch/frontend && npx tsc --noEmit
- Fix any type errors that arise
- Commit with a descriptive message and push to claude/optimize-3d-rendering-c32HK

STEP-BY-STEP:

STEP 4 (Terrain + Fog):
- In TacticalMap.tsx, add a handleMapLoad useCallback after handleOverlayLoaded (line 991) that:
  - Gets the underlying map via mapRef.current?.getMap()
  - Adds a 'terrain-dem' raster-dem source using Terrarium tiles
  - Calls map.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 })
  - Calls map.setFog() with dark theme colors
- Add onLoad={handleMapLoad} to the <GLMap> component
- Update setViewMode '3d' to pitch: 50 with ease-out cubic easing
- Update setViewMode '2d' to duration: 1500 with ease-out cubic easing

STEP 6 (Worker Batching):
- In tak.worker.ts, add batch accumulation variables after the takType declaration
- Replace the single self.postMessage({ type: 'entity_update' }) with batch logic
- In TacticalMap.tsx worker.onmessage, extract entity processing into a
  processEntityUpdate function and add an 'entity_batch' handler that iterates it

STEP 8 (Backend Cleanup):
- In poller/main.py, remove ARBI_MIN_DIST_M constant (line 39)
- Remove lat/lon params from _should_publish signature
- Update the call site on line 301

STEP 7 (Combined Animation Loop — includes Steps 1, 2, 3):
- Add lastFrameTimeRef = useRef<number>(Date.now()) after visualStateRef
- Change visualStateRef type to include alt: { lon: number; lat: number; alt: number }
- Replace the three separate iteration passes (cleanup, count, interpolate) in the
  animation loop with a single combined pass that:
  - Uses dt-normalized EWMA: 1 - Math.pow(1 - BASE_ALPHA, dt / 16.67)
  - Smooths altitude: visual.alt = visual.alt + (entity.altitude - visual.alt) * smoothFactor
  - Dead-reckons from curr.lat/curr.lon instead of entity.lat/entity.lon
  - Defers stale entity deletion until after iteration completes
  - Pushes interpolated entities with smoothed altitude
- Add lastFrameTimeRef.current = Date.now() to the mission-change cleanup effect
- Add visualStateRef.current.delete(uid) to stale cleanup

STEP 9 (Camera Easing):
- Add easing: (t: number) => 1 - Math.pow(1 - t, 3) to the three remaining flyTo
  calls (handleSetFocus, handlePresetSelect, loadActiveMission)

STEP 10 (Verify):
- Run npx tsc --noEmit and fix any errors
- Commit all changes and push
```

---

_Plan generated from RENDERING_OPTIMIZATION_REPORT.md analysis_
