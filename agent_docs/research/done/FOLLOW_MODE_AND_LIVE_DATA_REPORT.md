# Follow Mode & Live Entity Data Report
**Sovereign Watch — Camera Tracking & Information Feed Analysis**

---

## Executive Summary

Two related issues prevent the "center on selected COT" feature from working as a persistent follow camera, and cause entity data in the search/intel feed to display stale positions. Both issues stem from the same root cause identified in the dead reckoning report (animation loop dependency array), plus two additional problems specific to follow mode. The fixes described here are designed to layer cleanly on top of the Projective Velocity Blending (PVB) changes from the dead reckoning report.

---

## Table of Contents

1. [Issue 1 — Follow Mode Drops After Initial FlyTo](#1-issue-1--follow-mode-drops-after-initial-flyto)
2. [Issue 2 — Entity Data in Search/Feed Does Not Update Live](#2-issue-2--entity-data-in-searchfeed-does-not-update-live)
3. [Root Cause Analysis](#3-root-cause-analysis)
4. [Implementation Fix](#4-implementation-fix)
5. [Compatibility with Dead Reckoning PVB Fix](#5-compatibility-with-dead-reckoning-pvb-fix)
6. [Agent Prompts](#6-agent-prompts)

---

## 1. Issue 1 — Follow Mode Drops After Initial FlyTo

**Symptom:** User selects an entity, clicks CENTER_VIEW, the camera flies to the entity, but then the camera stops tracking. The entity continues moving while the camera remains stationary at the position where the flyTo animation ended.

### What should happen:
1. User clicks CENTER_VIEW
2. Camera smoothly flies to entity
3. Camera locks onto entity and moves with it indefinitely
4. Camera only unlocks when user manually pans/drags

### What actually happens:
1. User clicks CENTER_VIEW
2. Camera flies to entity (1s `flyTo` animation)
3. Camera arrives at entity's position **from 1 second ago**
4. Follow mode fires `jumpTo` for 1-2 frames
5. Animation loop restarts due to dependency array cascade
6. During restart gap, camera falls behind
7. Follow mode produces jerky, stuttering tracking
8. Eventually appears to stop following entirely

---

## 2. Issue 2 — Entity Data in Search/Feed Does Not Update Live

**Symptom:** When searching for entities in the SearchWidget, the results display positions that were correct at the moment of search but become stale as entities move. The IntelFeed shows event callsigns but no live position data.

### Current behavior:
- **SearchWidget**: Performs search on keystroke (debounced 300ms). Results contain a snapshot of `entity.lat/lon` at search time. The results list does **not** re-render as entities move.
- **IntelFeed**: Displays event messages (new/lost/alert) with callsigns. Clicking an event does a `searchLocal` to find the entity and `flyTo` its position. The position used is from `entitiesRef.current` (live), but only at the moment of the click.
- **SidebarRight**: Does receive live updates (~30Hz via `onEntitySelect` in the animation loop) when an entity is selected. This is the one component that works correctly for live data.

### The deeper issue:
The SidebarLeft passes `onEntitySelect={setSelectedEntity}` (line 272 in App.tsx) — the **raw state setter** — while TacticalMap passes `onEntitySelect={handleEntitySelect}` (line 297) which wraps the setter with follow-mode-off logic. This means entities selected from the search/intel feed bypass the `handleEntitySelect` wrapper. This isn't a bug per se, but it means the left sidebar has a different code path than the map.

---

## 3. Root Cause Analysis

### Cause A — Animation Loop Dependency Cascade (Same as Dead Reckoning Fix 3)

The animation loop `useEffect` dependency array at line 1224:

```typescript
}, [selectedEntity, onCountsUpdate, filters, onEvent, onEntitySelect,
    mapLoaded, enable3d, mapToken, mapStyle, viewState, replayMode]);
```

Contains both `selectedEntity` and `viewState`. The follow mode block inside the animation loop does:

```typescript
map.jumpTo({ center: [centerLon, centerLat], animate: false });
```

This triggers the mapbox-gl `move` event → react-map-gl's `onMove` callback → `setViewState(evt.viewState)` → `viewState` changes → **useEffect restarts**.

Additionally, the animation loop calls `onEntitySelect(interpolatedEntity)` at ~30Hz → `selectedEntity` changes → **useEffect restarts again**.

Each restart involves:
1. `cancelAnimationFrame(rafRef.current)` — current frame killed
2. New `requestAnimationFrame(animate)` queued — next frame ~16ms later
3. During that 16ms gap, the camera is NOT being updated

With two restart triggers per frame (viewState + selectedEntity), the animation loop is being torn down and restarted **~60 times per second**. Each restart introduces a frame gap where no `jumpTo` fires. The camera falls behind the entity, catches up with a jump, then falls behind again — producing the stuttering follow behavior.

### Cause B — `flyTo` + `isEasing()` Guard Creates a 1-Second Follow Blackout

When CENTER_VIEW is clicked, `App.tsx` calls:

```typescript
// Line 285-286
setFollowMode(true);
mapActions.flyTo(lat, lon);
```

`mapActions.flyTo` starts a 1-second easing animation (line 1487 in TacticalMap):

```typescript
map.flyTo({ center: [cLon, cLat], zoom: targetZoom, duration: 1000 });
```

During this entire 1-second animation, `map.isEasing()` returns `true`. The follow mode block explicitly skips when easing:

```typescript
if (!isUserInteracting && !map.isEasing()) {
    map.jumpTo({ center: [centerLon, centerLat], animate: false });
}
```

So for the first full second after clicking CENTER_VIEW, follow mode is completely disabled. During that second, a 450-knot aircraft moves ~231 meters. When the easing finishes and follow mode finally fires `jumpTo`, the camera snaps ~231m to catch up — a very visible jerk.

### Cause C — `flyTo` Uses Stale Coordinates

`onCenterMap` passes the entity's lat/lon from the **current React render**:

```typescript
// SidebarRight line 81
onClick={() => onCenterMap?.(entity.lat, entity.lon)}
```

But `entity` is the `selectedEntity` prop, which was last updated by the animation loop's `onEntitySelect` callback. Due to the dependency cascade (Cause A), this value can be several frames behind. The `flyTo` animation targets a position that's already stale by the time it starts, and increasingly stale during its 1-second duration.

### Cause D — SearchWidget Results are Static Snapshots

`SearchWidget` calls `mapActions.searchLocal(query)` which reads from `entitiesRef.current`:

```typescript
// TacticalMap line 1493-1501
searchLocal: (query: string) => {
    const results: CoTEntity[] = [];
    const q = query.toLowerCase();
    entitiesRef.current.forEach((e: CoTEntity) => {
        if (e.callsign.toLowerCase().includes(q) || e.uid.toLowerCase().includes(q)) {
            results.push(e);
        }
    });
    return results;
}
```

This returns entity objects from the **raw** entity store (not the interpolated visual positions). These objects are snapshots at the time of search. The SearchWidget stores them in local state (`results`) and never refreshes them. As entities move, the search results display increasingly stale lat/lon values.

### Cause E — SidebarLeft Uses Raw `setSelectedEntity` Instead of `handleEntitySelect`

```typescript
// App.tsx line 272 — SidebarLeft gets the raw setter
onEntitySelect={setSelectedEntity}

// App.tsx line 297 — TacticalMap gets the wrapped handler
onEntitySelect={handleEntitySelect}
```

This means selecting an entity from SearchWidget or IntelFeed does NOT trigger the animation loop's ~30Hz live update mechanism in the same way. The entity object passed from `searchLocal` is a reference into `entitiesRef.current`, which does get mutated by incoming WebSocket updates — but React doesn't know about those mutations because they happen on a ref, not state. The SidebarRight receives the same stale object reference until the animation loop's `onEntitySelect` fires (which requires the entity to already be selected AND the animation loop to be running without restart issues).

---

## 4. Implementation Fix

### Fix 1 — Remove `selectedEntity` and `viewState` from Animation Loop Deps

**(This is the same as Dead Reckoning Report Fix 3 — shared root cause)**

```typescript
// BEFORE (line 1224):
}, [selectedEntity, onCountsUpdate, filters, onEvent, onEntitySelect,
    mapLoaded, enable3d, mapToken, mapStyle, viewState, replayMode]);

// AFTER:
}, [onCountsUpdate, filters, onEvent, onEntitySelect,
    mapLoaded, enable3d, mapToken, mapStyle, replayMode]);
```

**Why this is safe:** The animation loop reads `selectedEntity` via `selectedEntityRef.current` and map state via `mapRef.current.getMap()` — both are refs that don't need to be in the dependency array. The loop runs continuously via `requestAnimationFrame` and reacts to ref changes on the next frame.

**Impact on follow mode:** The loop will no longer restart when `jumpTo` triggers `onMove` → `setViewState`, or when `onEntitySelect` updates the selected entity. The camera will be updated every single frame (~60Hz) without gaps.

### Fix 2 — Replace flyTo + isEasing Guard with Immediate Follow

When CENTER_VIEW is clicked, instead of doing a `flyTo` animation that blocks follow mode for 1 second, enable follow mode and let the animation loop handle the camera immediately. Only use `flyTo` when the camera is very far from the entity (>1km screen distance).

**App.tsx change:**

```typescript
// BEFORE (lines 282-287):
onCenterMap={(lat, lon) => {
    if (mapActions) {
        setFollowMode(true);
        mapActions.flyTo(lat, lon);
    }
}}

// AFTER:
onCenterMap={() => {
    // Just enable follow mode — the animation loop handles camera positioning.
    // The loop's jumpTo will snap the camera on the very next frame.
    setFollowMode(true);
}}
```

**TacticalMap.tsx — Remove `isEasing()` guard for follow mode:**

```typescript
// BEFORE (lines 956-961):
if (!isUserInteracting && !map.isEasing()) {
    map.jumpTo({ center: [centerLon, centerLat], animate: false });
}

// AFTER:
if (!isUserInteracting) {
    map.jumpTo({ center: [centerLon, centerLat], animate: false });
}
```

Rationale: `isEasing()` was there to prevent follow mode from fighting with `flyTo`. But if we remove the `flyTo` call from CENTER_VIEW, there's no easing to conflict with. The only remaining easing sources are mission area changes and view mode switches — neither should occur while following an entity. If a user triggers a mission change while following, the mission change effect already clears the selection.

**Optional smoothing:** If the snap feels too abrupt when the camera is far away, use `easeTo` with a short duration instead of `jumpTo`:

```typescript
if (!isUserInteracting) {
    const currentCenter = map.getCenter();
    const dist = Math.abs(currentCenter.lng - centerLon) + Math.abs(currentCenter.lat - centerLat);

    if (dist > 0.01) {
        // Camera is far — ease to target over 300ms
        map.easeTo({ center: [centerLon, centerLat], duration: 300, animate: true });
    } else {
        // Camera is close — snap instantly for smooth tracking
        map.jumpTo({ center: [centerLon, centerLat], animate: false });
    }
}
```

### Fix 3 — Unify `onEntitySelect` Callback Across All Components

**App.tsx change — use `handleEntitySelect` everywhere:**

```typescript
// BEFORE (line 272):
onEntitySelect={setSelectedEntity}

// AFTER:
onEntitySelect={handleEntitySelect}
```

This ensures all selection paths (map click, search, intel feed) use the same callback that properly manages follow mode state.

### Fix 4 — Live-Updating Search Results (Secondary)

To make the SearchWidget display live positions, add a periodic refresh of live search results while the results dropdown is visible:

**SearchWidget.tsx changes:**

```typescript
// Add a refresh interval that re-runs local search every 2 seconds
// while results are displayed
useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2 || results.length === 0) return;

    const refreshInterval = setInterval(() => {
        const localMatches = mapActions.searchLocal(debouncedQuery);

        setResults(prev => prev.map(result => {
            if (!result.isLive) return result; // Don't refresh historical

            // Find the updated entity in live data
            const updated = localMatches.find(e => e.uid === result.uid);
            if (updated) {
                return {
                    ...result,
                    lat: updated.lat,
                    lon: updated.lon,
                    lastSeen: updated.lastSeen,
                    entity: updated,
                };
            }
            return result;
        }));
    }, 2000); // Refresh every 2 seconds

    return () => clearInterval(refreshInterval);
}, [debouncedQuery, results.length > 0, mapActions]);
```

Additionally, display the entity's position in the search results for better situational awareness:

```typescript
// In the results rendering, add lat/lon display:
<div className="flex items-center gap-2 text-[10px] text-white/40 font-mono">
    <span>{result.callsign}</span>
    <span>•</span>
    <span>{result.lat.toFixed(4)}° {result.lon.toFixed(4)}°</span>
    <span>•</span>
    <div className="flex items-center gap-1">
        {result.isLive ? <Clock size={8} /> : <History size={8} />}
        <span>{formatTimeAgo(result.lastSeen)}</span>
    </div>
</div>
```

### Fix 5 — Expose Live Entity List via MapActions (Optional Enhancement)

For a persistent live entity feed (not just search-on-demand), expose a method that returns all currently tracked entities:

**types.ts — extend MapActions:**

```typescript
export interface MapActions {
    flyTo: (lat: number, lon: number, zoom?: number) => void;
    fitBounds: (bounds: [[number, number], [number, number]]) => void;
    searchLocal: (query: string) => CoTEntity[];
    getLiveEntities: () => CoTEntity[];  // NEW: returns all tracked entities
}
```

**TacticalMap.tsx — implement in mapActions:**

```typescript
getLiveEntities: () => {
    const entities: CoTEntity[] = [];
    entitiesRef.current.forEach((e: CoTEntity) => {
        entities.push(e);
    });
    return entities;
}
```

This allows any component to poll for all live entities and display a constantly updating entity list.

---

## 5. Compatibility with Dead Reckoning PVB Fix

All fixes in this report are designed to be compatible with the PVB dead reckoning fix from the first report. Here's how they interact:

| This Report Fix | DR Report Fix | Interaction |
|----------------|---------------|-------------|
| Fix 1 (remove deps) | Fix 3 (same fix) | **Identical** — implement once. |
| Fix 2 (remove flyTo + isEasing) | Fix 2 (PVB interpolation) | **Compatible** — PVB changes the interpolation model, Fix 2 here changes the camera. They don't touch the same code. The follow mode `jumpTo` reads from `visualStateRef` which PVB populates. |
| Fix 3 (unify onEntitySelect) | N/A | **Independent** — App.tsx change only. |
| Fix 4 (live search results) | N/A | **Independent** — SearchWidget change only. |
| Fix 5 (live entity list) | N/A | **Independent** — types + TacticalMap addition. |

### Implementation Order (Both Reports Combined)

```
1. DR Fix 1 — Restore small-area polling optimization (backend)
2. DR Fix 2 — Replace interpolation with PVB (TacticalMap animation loop)
3. Shared Fix — Remove selectedEntity + viewState from deps (TacticalMap line 1224)
4. Follow Fix 2 — Remove flyTo from CENTER_VIEW, remove isEasing guard
5. Follow Fix 3 — Unify onEntitySelect in App.tsx
6. Follow Fix 4 — Live-updating search results (SearchWidget)
7. DR Fix 4 — Backend arbitration cache tuning (optional)
8. Follow Fix 5 — Live entity list API (optional)
```

Steps 1–5 are critical and address the user-reported issues. Steps 6–8 are quality-of-life improvements.

---

## 6. Agent Prompts

### Prompt 1 — Fix Animation Loop Dependencies (Shared with DR Report)

```
TASK: Remove selectedEntity and viewState from the TacticalMap animation loop's
useEffect dependency array.

FILE: frontend/src/components/map/TacticalMap.tsx

Find the animation loop useEffect (starts around line 790 with `const animate = () => {`)
and locate its dependency array at the end (around line 1224).

CHANGE the dependency array from:
  [selectedEntity, onCountsUpdate, filters, onEvent, onEntitySelect,
   mapLoaded, enable3d, mapToken, mapStyle, viewState, replayMode]
TO:
  [onCountsUpdate, filters, onEvent, onEntitySelect,
   mapLoaded, enable3d, mapToken, mapStyle, replayMode]

REASON: The animation loop reads selectedEntity via selectedEntityRef.current
and map state via mapRef.current.getMap(). These are refs, not state, so they
don't belong in the dependency array. Having them there causes the animation
loop to tear down and restart ~60 times per second, breaking both dead reckoning
smoothness and follow mode camera tracking.

VERIFY:
1. The animation loop should run continuously without restarts when an entity
   is selected
2. Follow mode camera tracking should be smooth (no jitter/stuttering)
3. Pan/zoom should not interrupt the animation loop
4. Entity selection via map click should still highlight correctly
```

### Prompt 2 — Fix Follow Mode Camera Tracking

```
TASK: Fix follow mode so the camera persistently tracks the selected entity
without relying on flyTo or the isEasing guard.

FILES:
- frontend/src/App.tsx
- frontend/src/components/map/TacticalMap.tsx

CHANGES:

A) In App.tsx, simplify the onCenterMap handler (around line 282-287):

   BEFORE:
   onCenterMap={(lat, lon) => {
       if (mapActions) {
           setFollowMode(true);
           mapActions.flyTo(lat, lon);
       }
   }}

   AFTER:
   onCenterMap={() => {
       setFollowMode(true);
   }}

   The animation loop's follow mode block will handle camera positioning on
   the very next frame. No flyTo needed — jumpTo is instant.

B) In SidebarRight.tsx, update the CENTER_VIEW button onClick (around line 81):

   BEFORE:
   onClick={() => onCenterMap?.(entity.lat, entity.lon)}

   AFTER:
   onClick={() => onCenterMap?.()}

   Update the SidebarRightProps interface to match:
   onCenterMap?: () => void;

C) In TacticalMap.tsx, in the follow mode block inside the animation loop
   (around line 956), remove the isEasing guard:

   BEFORE:
   if (!isUserInteracting && !map.isEasing()) {
       map.jumpTo({ center: [centerLon, centerLat], animate: false });
   }

   AFTER:
   if (!isUserInteracting) {
       map.jumpTo({ center: [centerLon, centerLat], animate: false });
   }

VERIFY:
1. Click CENTER_VIEW — camera should snap to entity immediately
2. Entity should be tracked smoothly as it moves (no stuttering)
3. Drag the map — follow mode should disengage
4. Click CENTER_VIEW again — follow mode should re-engage
5. Fast aircraft should be tracked without rubber banding
```

### Prompt 3 — Unify Entity Selection Callback

```
TASK: Ensure all entity selection paths use the same callback that properly
manages follow mode state.

FILE: frontend/src/App.tsx

CHANGE: On the SidebarLeft component (around line 272), change:

   BEFORE:
   onEntitySelect={setSelectedEntity}

   AFTER:
   onEntitySelect={handleEntitySelect}

REASON: setSelectedEntity is the raw state setter which does NOT disable follow
mode on deselection. handleEntitySelect (line 239-243) wraps the setter and
calls setFollowMode(false) when the entity is deselected (set to null).
This ensures consistent behavior regardless of whether selection comes from
the map, search widget, or intel feed.

VERIFY:
1. Select an entity from search → sidebar should show entity details
2. Click CENTER_VIEW → follow mode enabled
3. Select a DIFFERENT entity from search → follow mode should stop
   (new entity is selected, but follow mode should reset since context changed)
4. Click X to close sidebar → follow mode should stop
```

### Prompt 4 — Live-Updating Search Results

```
TASK: Make the SearchWidget periodically refresh live entity positions in the
results dropdown so that lat/lon values stay current as entities move.

FILE: frontend/src/components/widgets/SearchWidget.tsx

CHANGES:

A) Add a refresh effect after the existing search effect. This should:
   - Only run when there are visible results AND a non-empty query
   - Every 2 seconds, re-run mapActions.searchLocal(debouncedQuery)
   - Update ONLY the live results (isLive: true) with fresh lat/lon/lastSeen
   - Leave historical results unchanged
   - Clean up the interval on unmount or when results close

   Implementation:
   useEffect(() => {
       if (!debouncedQuery || debouncedQuery.length < 2 || results.length === 0) return;

       const refreshInterval = setInterval(() => {
           const localMatches = mapActions.searchLocal(debouncedQuery);

           setResults(prev => prev.map(result => {
               if (!result.isLive) return result;
               const updated = localMatches.find(e => e.uid === result.uid);
               if (updated) {
                   return {
                       ...result,
                       lat: updated.lat,
                       lon: updated.lon,
                       lastSeen: updated.lastSeen,
                       entity: updated,
                   };
               }
               return result;
           }));
       }, 2000);

       return () => clearInterval(refreshInterval);
   }, [debouncedQuery, results.length > 0, mapActions]);

B) In the results display, add lat/lon coordinates to each result's metadata line
   so the user can see positions updating:

   Replace the existing metadata line (around line 178-185) with:
   <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono">
       <span>{result.lat.toFixed(4)}° {result.lon.toFixed(4)}°</span>
       <span>•</span>
       <div className="flex items-center gap-1">
           {result.isLive ? <Clock size={8} /> : <History size={8} />}
           <span>{formatTimeAgo(result.lastSeen)}</span>
       </div>
   </div>

VERIFY:
1. Search for a known aircraft callsign
2. Keep the results dropdown open
3. Observe lat/lon values updating every ~2 seconds
4. Historical results should NOT change
5. Close the dropdown — interval should stop (check no console errors)
```

---

## Appendix A — Data Flow Diagram (Fixed)

```
┌──────────────────────────────────────────────────────────────────┐
│                        App.tsx                                    │
│                                                                  │
│  selectedEntity ←──── handleEntitySelect() ←─────────────────┐   │
│       │                        ↑                              │   │
│       │              (unified callback)                       │   │
│       ▼                        │                              │   │
│  ┌─────────┐    ┌──────────────┴──────────────┐    ┌─────────┴┐  │
│  │Sidebar  │    │        TacticalMap          │    │Sidebar   │  │
│  │Left     │    │                             │    │Right     │  │
│  │         │    │  Animation Loop (60fps)     │    │          │  │
│  │ Search  │──→ │    │                        │ ──→│ Entity   │  │
│  │ Intel   │    │    ├─ PVB Interpolation     │    │ Details  │  │
│  │ Feed    │    │    ├─ Follow Mode jumpTo ───┼──→ │ Compass  │  │
│  │         │    │    └─ onEntitySelect(30Hz) ─┼──→ │ Payload  │  │
│  └─────────┘    │                             │    └──────────┘  │
│                 │  selectedEntityRef (ref)     │                  │
│                 │  visualStateRef (ref)        │                  │
│                 │  followModeRef (ref)         │                  │
│                 └─────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘

Key: All animation-critical reads use REFS (not state).
     useEffect deps only include render-affecting values (filters, mapLoaded, etc).
     Follow mode jumpTo runs every frame without isEasing guard.
     selectedEntity/viewState NOT in animation loop deps.
```

## Appendix B — Follow Mode State Machine

```
             ┌────────────────────────────────────────────┐
             │                                            │
             ▼                                            │
     ┌───────────────┐    CENTER_VIEW click     ┌────────┴──────┐
     │               │ ────────────────────────→│               │
     │  FOLLOW_OFF   │                          │  FOLLOW_ON    │
     │               │ ←────────────────────────│               │
     └───────────────┘    user drag/pan         └───────────────┘
             ▲                                            │
             │                                            │
             │    entity deselected                       │
             │    sidebar closed                          │
             └────────────────────────────────────────────┘

     FOLLOW_ON behavior (per frame):
       1. Read visual position from visualStateRef
       2. Apply 3D altitude compensation
       3. Check !isUserInteracting
       4. map.jumpTo(compensated position)
```

---

*Report generated from source analysis of Sovereign Watch v0.5.0 (commit 7b89cbe)*
*Affected files: `frontend/src/App.tsx`, `frontend/src/components/map/TacticalMap.tsx`, `frontend/src/components/layouts/SidebarRight.tsx`, `frontend/src/components/widgets/SearchWidget.tsx`*
*Analysis date: 2026-02-17*
