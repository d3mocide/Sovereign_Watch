# BUG REPORT — HIST_TAIL Zigzag & Related Issues
**Branch:** `claude/fix-hist-tail-zigzag-xZTP8`
**Severity:** P1 (Visual correctness), P2 (Functional follow mode)
**Affected Systems:** Trail rendering, Follow/Center View, Search Widget, Backend API

---

## EXECUTIVE SUMMARY

After the most recent update, HIST_TAIL indicators show erratic zigzag lines instead of smooth tracks. Investigation found **6 confirmed bugs** across the frontend and backend, with **3 directly contributing to trail zigzag** and **1 completely breaking the Follow/Center View for CoT**. The Search Widget also contains a critical double-execution bug that hammers the API and corrupts results.

---

## BUG #1 — HIST_TAIL ZIGZAG (PRIMARY): Raw Server Coordinates Mixed with Interpolated Visual Head

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Lines:** 1116–1119 (PathLayer `getPath` accessor)
**Severity:** P1 — Direct cause of the visible zigzag

### Description

The rendered trail path is built by concatenating two fundamentally different coordinate spaces:

```typescript
// TacticalMap.tsx:1116-1119
getPath: (d: any) => {
    if (!d.trail || d.trail.length === 0) return [];
    // Appends the visual (interpolated/smooth) head to the raw trail
    return [...d.trail.map((p: any) => [p[0], p[1], p[2]]), [d.lon, d.lat, d.altitude]];
},
```

`d.trail` contains **raw server coordinates** (positions as reported by the data source, with all multilateration noise intact). The last appended element `[d.lon, d.lat, d.altitude]` is the **smooth visual/interpolated position** calculated by the PVB algorithm.

Every animation frame (~60Hz), the interpolated head moves forward in space. When a new server packet arrives, the PVB blending origin resets, snapping the visual head back toward the new raw server position. The last rendered segment of the trail therefore oscillates at every packet arrival — stretching forward then snapping back — creating the visible zigzag at the head of every trail.

### Why This Got Worse After the Update

If the update increased update frequency (more Kafka throughput, lower polling interval, more active data sources), packet arrivals are more frequent, causing the snap-back to occur more often and be more visible. Higher entity counts also amplify this since more trails are affected simultaneously.

### Fix

**Option A (Recommended — Clean):** Do not append the visual head to the trail path. The trail should represent historical confirmed positions only. The visual icon handles the present position.

```typescript
// TacticalMap.tsx:1116-1119 — REPLACE getPath accessor
getPath: (d: any) => {
    if (!d.trail || d.trail.length < 2) return [];
    return d.trail.map((p: any) => [p[0], p[1], p[2]]);
},
```

**Option B (Smooth growth, safe):** Only append the visual head if it is "ahead" of the last trail point by more than a threshold, otherwise omit it.

```typescript
getPath: (d: any) => {
    if (!d.trail || d.trail.length < 2) return [];
    const last = d.trail[d.trail.length - 1];
    const headDist = getDistanceMeters(last[1], last[0], d.lat, d.lon);
    const base = d.trail.map((p: any) => [p[0], p[1], p[2]]);
    return headDist > 25 ? [...base, [d.lon, d.lat, d.altitude]] : base;
},
```

Apply the same fix to the **selected entity trail** at line 1144:
```typescript
// TacticalMap.tsx:1144 — Also fix the selected trail path
const trailPath = entity.trail.map(p => [p[0], p[1], p[2]]);
// Remove: [...entity.trail.map(p => [p[0], p[1], p[2]]), [entity.lon, entity.lat, entity.altitude]]
```

---

## BUG #2 — HIST_TAIL ZIGZAG (SECONDARY): Multilateration Noise Bypasses Distance Gate

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Lines:** 625–636 (trail construction in `processEntityUpdate`)
**Severity:** P1 — Direct cause of zigzag in historical trail points

### Description

The trail is built by appending raw server positions, gated only by a 50-meter distance check:

```typescript
// TacticalMap.tsx:625-636
const MIN_TRAIL_DIST_M = 50;
let trail: TrailPoint[] = existing?.trail || [];
const lastTrail = trail[trail.length - 1];
const distFromLastTrail = lastTrail
    ? getDistanceMeters(lastTrail[1], lastTrail[0], newLat, newLon)
    : Infinity;
if (distFromLastTrail > MIN_TRAIL_DIST_M) {
    const speed = entity.detail?.track?.speed || 0;
    trail = [...trail, [newLon, newLat, entity.hae || 0, speed] as TrailPoint].slice(-100);
}
```

ADS-B multilateration (MLAT) networks can report the same aircraft from different ground station triangulations, producing positions that differ by **50–300 meters**. These are legitimate packets with valid increasing timestamps but represent noise, not real movement. With a 50m gate, many noise points get committed to the trail, creating a zigzag pattern in the stored history that persists on screen.

The timestamp ordering check (lines 645–648) prevents time-reversed packets but does not deduplicate near-simultaneous MLAT variations.

### Fix

Add a **temporal deduplication gate** in addition to the spatial gate. Trail points should only be appended if a minimum time has elapsed since the last trail point. This collapses multilateration noise from the same moment into a single point.

Add a `TrailPoint` timestamp to `types.ts`:
```typescript
// types.ts — Extend TrailPoint with timestamp
export type TrailPoint = [number, number, number, number, number?];
// [lon, lat, altitude, speed, timestamp_ms?]
```

Then in `processEntityUpdate`, gate on both distance AND time:
```typescript
// TacticalMap.tsx — trail construction
const MIN_TRAIL_DIST_M = 50;
const MIN_TRAIL_INTERVAL_MS = 3000; // Minimum 3 seconds between trail points

let trail: TrailPoint[] = existing?.trail || [];
const lastTrail = trail[trail.length - 1];
const distFromLastTrail = lastTrail
    ? getDistanceMeters(lastTrail[1], lastTrail[0], newLat, newLon)
    : Infinity;
const timeSinceLastTrail = lastTrail && lastTrail[4]
    ? (Date.now() - lastTrail[4])
    : Infinity;

if (distFromLastTrail > MIN_TRAIL_DIST_M && timeSinceLastTrail > MIN_TRAIL_INTERVAL_MS) {
    const speed = entity.detail?.track?.speed || 0;
    trail = [...trail, [newLon, newLat, entity.hae || 0, speed, Date.now()] as TrailPoint].slice(-100);
}
```

---

## BUG #3 — HIST_TAIL ZIGZAG (TERTIARY): Dead Reckoning Fallback Reads Overwritten State

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Lines:** 669–680 (`drStateRef.current.set`) then 722–742 (course calculation)
**Severity:** P2 — Corrupts heading/course calculation for new entities and entities with short trails

### Description

The DR (dead reckoning) state is written with the **new** packet's position at line 669:

```typescript
// TacticalMap.tsx:669-680
drStateRef.current.set(entity.uid, {
    serverLat: newLat,  // <-- WRITTEN with current packet
    serverLon: newLon,  // <-- WRITTEN with current packet
    ...
});
```

Then, **later in the same function**, the course fallback branch reads `prevPos` (line 722), which is now the **already-overwritten** current position:

```typescript
// TacticalMap.tsx:722-742
const prevPos = drStateRef.current.get(entity.uid); // <-- READS back the newly written state!
...
} else if (prevPos) {
    // prevPos.serverLat == newLat (same value!) — calculates distance 0
    const dist = getDistanceMeters(prevPos.serverLat, prevPos.serverLon, newLat, newLon);
    if (dist > 2.0) { // NEVER TRUE — dist is always 0
        computedCourse = getBearing(prevPos.serverLat, prevPos.serverLon, newLat, newLon);
    }
}
```

The fallback branch (`else if (prevPos)`) will NEVER compute a new bearing because the distance from `(newLat, newLon)` to `(newLat, newLon)` is always 0. This means entities with fewer than 2 trail points (new entities, recently cleared entities) always inherit `rawCourse` from the packet — which for MLAT data is often 0 or unreliable. This contributes to incorrect heading arrows that then conflict with the actual trail direction.

### Fix

Capture the previous DR state **before** overwriting it:

```typescript
// TacticalMap.tsx — capture BEFORE the drStateRef.current.set call at line 669
const previousDr = drStateRef.current.get(entity.uid); // Save BEFORE overwrite

drStateRef.current.set(entity.uid, {
    serverLat: newLat,
    serverLon: newLon,
    ...
});

// Later in course calculation, use previousDr instead of re-reading drStateRef
const prevPos = previousDr; // Not drStateRef.current.get(entity.uid)
```

---

## BUG #4 — FOLLOW MODE / CENTER VIEW BROKEN: `onEntitySelect` Disables Follow Mode Every Frame

**File:** `frontend/src/App.tsx` lines 263–267 and `frontend/src/components/map/TacticalMap.tsx` lines 1017–1024
**Severity:** P1 — CENTER VIEW / Follow Mode is completely non-functional

### Description

`handleEntitySelect` in `App.tsx` unconditionally disables follow mode on every invocation:

```typescript
// App.tsx:263-267
const handleEntitySelect = useCallback((e: CoTEntity | null) => {
    setSelectedEntity(e);
    setFollowMode(false); // <-- ALWAYS DISABLES FOLLOW MODE
}, []);
```

This callback is passed as `onEntitySelect` to `TacticalMap`. The animation loop uses `onEntitySelect` for **two distinct purposes**:

1. **User selection events** (click, search) — `setFollowMode(false)` is correct here
2. **Live sidebar data updates** — running at ~15Hz in the animation loop:

```typescript
// TacticalMap.tsx:1017-1024
if (currentSelected && uid === currentSelected.uid && onEntitySelect) {
    if (Math.floor(now / 33) % 2 === 0) {
        onEntitySelect(interpolatedEntity); // <-- Calls handleEntitySelect at 15Hz
    }
}
```

Every ~66ms, `handleEntitySelect` is called with the live entity to update the sidebar. Each call triggers `setFollowMode(false)`. The user can never keep follow mode enabled for more than one animation frame — it is killed within 66ms of activation every time.

### Fix

Separate the two concerns. Add a dedicated prop for live sidebar updates that does NOT affect follow mode:

**In `TacticalMap.tsx`** — add a new prop `onEntityLiveUpdate`:
```typescript
// TacticalMap.tsx — props interface
interface TacticalMapProps {
    ...
    onEntitySelect: (entity: CoTEntity | null) => void;    // User-driven selection
    onEntityLiveUpdate?: (entity: CoTEntity) => void;      // Animation loop sidebar sync
}
```

Use `onEntityLiveUpdate` in the animation loop:
```typescript
// TacticalMap.tsx:1017-1024 — REPLACE onEntitySelect call in animation loop
if (currentSelected && uid === currentSelected.uid && onEntityLiveUpdate) {
    if (Math.floor(now / 33) % 2 === 0) {
        onEntityLiveUpdate(interpolatedEntity);
    }
}
```

**In `App.tsx`** — add a handler that only updates entity state without touching follow mode:
```typescript
// App.tsx — add new handler
const handleEntityLiveUpdate = useCallback((e: CoTEntity) => {
    setSelectedEntity(e); // Update sidebar data only, do NOT change followMode
}, []);

// Pass to TacticalMap:
<TacticalMap
    ...
    onEntitySelect={handleEntitySelect}
    onEntityLiveUpdate={handleEntityLiveUpdate}
/>
```

---

## BUG #5 — SEARCH WIDGET: `performSearch()` Called Twice Per Query

**File:** `frontend/src/components/widgets/SearchWidget.tsx`
**Lines:** 102–104
**Severity:** P2 — Doubles all API search requests, can cause duplicate results

### Description

```typescript
// SearchWidget.tsx:102-104
performSearch();
performSearch(); // <-- DUPLICATE CALL — should not exist
```

Every debounced search query fires two `performSearch()` calls in rapid succession. Each call:
1. Sets `loading = true`
2. Fires a `GET /api/tracks/search` API request
3. Processes results and calls `setResults(combinedResults)`

The second call races the first. If the second finishes before the first, the first call's `setResults` will overwrite the second's results (or vice versa). This can also produce duplicate results in the list if both happen to complete at similar times and the `seenUids` deduplication set is not shared between them (it isn't — each call has its own closure).

Additionally, the live refresh `useEffect` dependency at line 130 is malformed:
```typescript
}, [debouncedQuery, results.length > 0, mapActions]);
// results.length > 0 is a boolean expression, not a stable dependency reference
// Should be: results.length
```

### Fix

Remove the duplicate `performSearch()` call:

```typescript
// SearchWidget.tsx:102 — DELETE line 103
performSearch();
// DELETE: performSearch();
```

Fix the dependency array:
```typescript
// SearchWidget.tsx:130
}, [debouncedQuery, results.length, mapActions]);
```

---

## BUG #6 — BACKEND: Dead Code Double Return in `get_mission_location`

**File:** `backend/api/main.py`
**Lines:** 241–243
**Severity:** P3 — Dead code / maintenance hazard

### Description

```python
# main.py:241-243
return default_mission
return {"status": "ok"}  # <-- UNREACHABLE — dead code
```

The second `return` statement is unreachable. It appears to be a copy-paste artifact from another endpoint. While harmless at runtime, it indicates the function was modified carelessly and is a maintenance hazard.

### Fix

Remove the dead `return` statement:
```python
# main.py — DELETE line 243
# DELETE: return {"status": "ok"}
```

---

## ADDITIONAL OBSERVATION: Animation Loop Missing `onFollowModeChange` Dependency

**File:** `frontend/src/components/map/TacticalMap.tsx`
**Line:** 1335 (dependency array of animation loop `useEffect`)

```typescript
// TacticalMap.tsx:1335 — onFollowModeChange is used in the loop (line 1051) but not listed
}, [onCountsUpdate, filters, onEvent, onEntitySelect, mapLoaded, enable3d, mapToken, mapStyle, replayMode]);
```

`onFollowModeChange` is called on line 1051 inside the animation loop but is not in the dependency array. If the parent re-renders and provides a new `onFollowModeChange` reference, the stale closure in the animation loop will call the old callback. This is a minor risk since `setFollowMode` from `useState` is stable, but should be corrected.

---

## ORDERED FIX PRIORITY

| # | Bug | File | Impact | Priority |
|---|-----|------|--------|----------|
| 4 | Follow Mode killed every frame by `handleEntitySelect` | `App.tsx:263` | CENTER_VIEW completely broken | **FIX FIRST** |
| 1 | Interpolated head appended to raw trail (zigzag at head) | `TacticalMap.tsx:1119,1144` | Primary zigzag cause | **FIX SECOND** |
| 2 | Multilateration noise bypasses 50m gate (no time gate) | `TacticalMap.tsx:625` | Historical zigzag in body of trail | **FIX THIRD** |
| 3 | DR fallback reads overwritten state, course always wrong | `TacticalMap.tsx:722` | Bad heading, worse for new entities | **FIX FOURTH** |
| 5 | `performSearch()` called twice, bad dependency | `SearchWidget.tsx:103,130` | Double API calls, potential bad results | **FIX FIFTH** |
| 6 | Dead code double return in backend | `main.py:243` | Cosmetic/maintenance | **FIX LAST** |

---

## AGENT PROMPTS

Use the following prompts with an AI agent to implement the fixes above:

---

### PROMPT 1 — Fix Follow Mode / CENTER VIEW (Bug #4)

```
In the file frontend/src/components/map/TacticalMap.tsx, the animation loop is calling
`onEntitySelect(interpolatedEntity)` at ~15Hz (lines 1017-1024) to keep the right sidebar
in sync with the live position. However `onEntitySelect` in App.tsx unconditionally calls
`setFollowMode(false)`, which means follow mode is destroyed every 66ms after activation.

Do the following:

1. In `frontend/src/types.ts`, add `onEntityLiveUpdate?: (entity: CoTEntity) => void` to
   the `MapActions` interface (or wherever appropriate).

2. In `frontend/src/components/map/TacticalMap.tsx`:
   a. Add `onEntityLiveUpdate?: (entity: CoTEntity) => void` to the `TacticalMapProps`
      interface (after line 271).
   b. Destructure `onEntityLiveUpdate` from props at the top of the component.
   c. In the animation loop (lines 1017-1024), replace the `onEntitySelect(interpolatedEntity)`
      call with `onEntityLiveUpdate?.(interpolatedEntity)`.
   d. Add `onEntityLiveUpdate` to the animation loop's useEffect dependency array (line 1335).

3. In `frontend/src/App.tsx`:
   a. Add a new `handleEntityLiveUpdate` callback using `useCallback`:
      ```
      const handleEntityLiveUpdate = useCallback((e: CoTEntity) => {
          setSelectedEntity(e);
      }, []);
      ```
   b. Pass `onEntityLiveUpdate={handleEntityLiveUpdate}` to the `<TacticalMap>` component.
   c. Leave `handleEntitySelect` unchanged — it correctly calls `setFollowMode(false)`
      for user-driven selection events.

After these changes, follow mode activated by the CENTER_VIEW button should persist until
the user manually pans/zooms the map.
```

---

### PROMPT 2 — Fix HIST_TAIL Zigzag at Trail Head (Bug #1)

```
In `frontend/src/components/map/TacticalMap.tsx`, the PathLayer for history trails
(approximately line 1116) is appending the live visual/interpolated position as the last
point of each trail path. This creates a zigzag because the trail body contains raw server
coordinates (noisy) while the head is the smooth interpolated position — when a new server
packet arrives and the interpolation snaps, the last segment of the trail oscillates.

Do the following:

1. In the `all-history-trails` PathLayer (~line 1116), change the `getPath` accessor to:
   ```typescript
   getPath: (d: any) => {
       if (!d.trail || d.trail.length < 2) return [];
       return d.trail.map((p: any) => [p[0], p[1], p[2]]);
   },
   ```
   Remove the `[d.lon, d.lat, d.altitude]` head append entirely.

2. In the `selected-trail-*` PathLayer (~line 1144), change the `trailPath` construction to:
   ```typescript
   const trailPath = entity.trail.map(p => [p[0], p[1], p[2]]);
   ```
   Remove the spread + head append.

3. Update the filter condition on both PathLayers: since we no longer need the visual head,
   the `entity.trail.length >= 2` check in the data filter is now the correct gate for
   whether a trail has enough points to render (it already exists on line 1114, keep it).

The trail will now only show confirmed historical positions, eliminating the oscillating head.
```

---

### PROMPT 3 — Fix HIST_TAIL Multilateration Noise (Bug #2)

```
In `frontend/src/components/map/TacticalMap.tsx` inside the `processEntityUpdate` function
(approximately lines 625-636), trail points are appended using only a 50-meter spatial gate.
This does not prevent ADS-B multilateration noise from different ground stations reporting
slightly different positions (50-300m apart) for the same aircraft at essentially the same
timestamp, causing zigzag artifacts in the stored trail.

Do the following:

1. In `frontend/src/types.ts`, update the `TrailPoint` type to include an optional timestamp:
   ```typescript
   export type TrailPoint = [number, number, number, number, number?];
   // [lon, lat, altitude, speed, timestamp_ms?]
   ```

2. In `frontend/src/components/map/TacticalMap.tsx`, in the `processEntityUpdate` function
   (approximately lines 625-636), add a temporal gate alongside the spatial gate:
   ```typescript
   const MIN_TRAIL_DIST_M = 50;
   const MIN_TRAIL_INTERVAL_MS = 3000; // 3 seconds between trail commits

   let trail: TrailPoint[] = existing?.trail || [];
   const lastTrail = trail[trail.length - 1];
   const distFromLastTrail = lastTrail
       ? getDistanceMeters(lastTrail[1], lastTrail[0], newLat, newLon)
       : Infinity;
   const timeSinceLastTrail = (lastTrail && lastTrail[4] != null)
       ? (Date.now() - lastTrail[4])
       : Infinity;

   if (distFromLastTrail > MIN_TRAIL_DIST_M && timeSinceLastTrail > MIN_TRAIL_INTERVAL_MS) {
       const speed = entity.detail?.track?.speed || 0;
       trail = [...trail, [newLon, newLat, entity.hae || 0, speed, Date.now()] as TrailPoint].slice(-100);
   }
   ```

   The temporal gate ensures that even if two sources report the same aircraft at positions
   > 50m apart within the same 3-second window, only the first one gets committed to the trail.
```

---

### PROMPT 4 — Fix Dead Reckoning Course Calculation (Bug #3)

```
In `frontend/src/components/map/TacticalMap.tsx` inside `processEntityUpdate`, the DR
(dead reckoning) state is overwritten with the current packet at approximately line 669.
Then at approximately line 722, `drStateRef.current.get(entity.uid)` is called again to
get `prevPos` for the course calculation fallback. Since the state was already overwritten,
`prevPos.serverLat` and `prevPos.serverLon` are identical to `newLat` and `newLon`, making
the distance always 0 and the fallback bearing never computed.

Do the following:

1. Before the `drStateRef.current.set(...)` call (approximately line 669), capture the
   previous state:
   ```typescript
   const previousDr = drStateRef.current.get(entity.uid); // CAPTURE BEFORE OVERWRITE
   ```

2. Leave the `drStateRef.current.set(...)` call exactly as-is.

3. In the course calculation block (approximately line 722), change:
   ```typescript
   const prevPos = drStateRef.current.get(entity.uid);
   ```
   to:
   ```typescript
   const prevPos = previousDr; // Use captured previous state, not current
   ```

   Do not change any other logic in the course calculation block.
```

---

### PROMPT 5 — Fix Search Widget Double Execution (Bug #5)

```
In `frontend/src/components/widgets/SearchWidget.tsx`:

1. At approximately line 103, there is a duplicate call `performSearch();` — the function
   is called twice back-to-back. Remove the second call entirely. Only one `performSearch()`
   should exist in that useEffect block.

2. At approximately line 130, the useEffect dependency array contains `results.length > 0`
   which is a boolean expression that evaluates at creation time and is not a proper reactive
   dependency. Change it to `results.length`:
   ```typescript
   }, [debouncedQuery, results.length, mapActions]);
   ```

Do not change any other logic in the SearchWidget.
```

---

### PROMPT 6 — Fix Backend Dead Code (Bug #6)

```
In `backend/api/main.py`, in the `get_mission_location` function (approximately lines 241-243),
there are two consecutive return statements. The second one (`return {"status": "ok"}`) is
unreachable dead code left over from a copy-paste. Remove line 243:
   ```python
   # DELETE this line:
   return {"status": "ok"}
   ```
Keep the `return default_mission` statement.
```

---

*Report generated from full codebase audit of `/home/user/Sovereign_Watch`. All line numbers reference the state of the codebase at time of analysis.*
