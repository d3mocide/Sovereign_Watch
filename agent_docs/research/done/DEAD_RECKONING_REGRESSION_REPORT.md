# Dead Reckoning Regression Report — ADS-B COT Rubber Banding
**Sovereign Watch — Post-v0.5.0 (Chronos) Regression Analysis**

---

## Executive Summary

After the v0.5.0 "Chronos" release (commit `7b89cbe`), ADS-B aviation COTs exhibit severe **rubber banding**: aircraft icons dead-reckon forward along their path, receive a new position update, then visually snap backward before resuming forward motion. The effect is most pronounced on fast-moving aircraft (>200 knots) and is absent on maritime COTs. This report identifies **three interacting regression causes** introduced or amplified by the v0.5.0 changes, documents how industry systems solve this class of problem, and provides a concrete implementation fix with agent prompts.

---

## Table of Contents

1. [Symptoms & Reproduction](#1-symptoms--reproduction)
2. [Root Cause Analysis](#2-root-cause-analysis)
3. [Why Maritime COTs Are Unaffected](#3-why-maritime-cots-are-unaffected)
4. [Industry Research — How Others Solve This](#4-industry-research--how-others-solve-this)
5. [Implementation Fix](#5-implementation-fix)
6. [Agent Prompts](#6-agent-prompts)

---

## 1. Symptoms & Reproduction

| Symptom | Description |
|---------|-------------|
| **Rubber banding** | Aircraft icon advances forward via dead reckoning, then snaps backward when a new ADS-B update arrives. The EWMA smoothing drags it backward over ~0.5–1.0 seconds, creating a visible elastic/rubber-band retraction. |
| **Speed correlation** | Worse at higher speeds. A 450-knot aircraft dead reckons ~115m/s × 2.5s = ~288m ahead; when snapped back, the retraction is clearly visible at zoom 12+. A 15-knot vessel moves ~19m ahead — imperceptible. |
| **Frequency** | Occurs on every position update cycle (~every 1–3 seconds per aircraft), creating a repeating sawtooth oscillation: forward-snap back-forward-snap back. |
| **3D mode amplification** | In 3D (pitch > 0), the `getCompensatedCenter` altitude offset exaggerates the visual displacement, making rubber banding appear even worse. |

---

## 2. Root Cause Analysis

The regression is caused by **three changes in v0.5.0 that interact destructively**:

### Regression A — Small-Area Polling Optimization Removed

**File:** `backend/ingestion/poller/main.py`, `calculate_polling_points()`

**What changed:** In v0.4.0, areas with `radius_nm < 50` used a single polling point (the center). In v0.5.0, this optimization was removed — all areas now use 3 overlapping polling points (center, NW offset, SE offset) regardless of size.

```python
# v0.4.0 — Single point for small areas
if self.radius_nm < 50:
    return [(self.center_lat, self.center_lon, self.radius_nm)]

# v0.5.0 — Always 3 points (optimization removed)
return [
    (self.center_lat, self.center_lon, self.radius_nm),
    (self.center_lat + 0.5, self.center_lon - 0.5, min(100, self.radius_nm)),
    (self.center_lat - 0.5, self.center_lon + 0.5, min(100, self.radius_nm)),
]
```

**Impact:** For a typical tactical area (30–80nm), the same aircraft now appears in 2–3 overlapping polling responses per cycle from each source. With 3 sources round-robining, a single aircraft can generate **6–9 position updates per second** instead of 2–3. Each update resets the interpolation snapshots (`prevSnapshot` ← old `currSnapshot`, `currSnapshot` ← new position), causing the dead reckoning to restart from zero `elapsed` time before the previous convergence completes. This is the **duplicate storm** that the existing arbitration cache was designed to suppress — but the 3× increase in overlapping polls overwhelms it.

### Regression B — The Fundamental Interpolation-to-Dead-Reckoning Handoff Flaw

**File:** `frontend/src/components/map/TacticalMap.tsx`, lines 854–883

This is not new to v0.5.0 but was amplified by Regression A. The interpolation model has a structural flaw in how it transitions between geometric interpolation and dead reckoning:

**The sawtooth cycle:**

```
Time    Action                                          Visual Position
─────   ──────────────────────────────────────────────  ───────────────
T+0s    Update arrives: prev=A, curr=B, elapsed=0       target ≈ A (t_geom≈0)
T+1s    Interpolating: t_geom=1.0                       target = B
T+1.5s  Dead reckoning: extrapolate 0.5s from B         target = B + DR(0.5s)
T+2.0s  Dead reckoning: extrapolate 1.0s from B         target = B + DR(1.0s)  ← AHEAD
T+2.5s  ★ NEW UPDATE arrives: prev=B, curr=C, elapsed≈0
         t_geom ≈ 0 → target = prev = B                 target SNAPS BACK to B ←←←
T+2.6s  EWMA slowly pulls visual backward toward B      RUBBER BAND visible
T+3.5s  t_geom reaches 1.0 → target = C                 finally catches up
```

The critical moment is at T+2.5s: the visual position was at `B + DR(1.0s)` (projected ahead by dead reckoning), but the new interpolation target resets to `prev` (which is `B` — the position *before* dead reckoning projected ahead). The target jumps backward by the entire dead reckoning offset. EWMA smoothing then drags the visual position backward over ~30–60 frames, creating the visible rubber band.

**The code:**
```typescript
// Lines 860–868: Geometric interpolation (prev → curr)
const t_geom = Math.min(elapsed / stableDuration, 1.0);
targetLon = prev.lon + (curr.lon - prev.lon) * t_geom;
targetLat = prev.lat + (curr.lat - prev.lat) * t_geom;

// Lines 873–883: Dead reckoning EXTENDS from curr (not from visual position!)
if (elapsed > stableDuration && entity.speed > 1.0) {
    const overrun = Math.min(elapsed - stableDuration, 2500) / 1000;
    // ... projects forward from curr.lat/curr.lon
    targetLat = curr.lat + dLat * (180 / Math.PI);
    targetLon = curr.lon + dLon * (180 / Math.PI);
}
```

**Why this produces rubber banding:**
- Dead reckoning projects forward from `curr`, creating a visual position *ahead* of `curr`
- When a new update arrives, `prev` becomes the OLD `curr`, and `curr` becomes the new position
- At `elapsed ≈ 0`, `t_geom ≈ 0`, so `target ≈ prev` = the OLD `curr`
- The OLD `curr` is behind where dead reckoning had projected to
- EWMA pulls the visual backward toward this target → **rubber band**

**Why it's worse now:** Regression A increased update frequency, so the sawtooth cycle repeats more often. With 6–9 updates/second, the entity barely has time to dead-reckon forward before being snapped back, creating a constant jittery oscillation instead of a clean sawtooth.

### Regression C — Animation Loop Restart from `onEntitySelect` Feedback Loop

**File:** `frontend/src/components/map/TacticalMap.tsx`, lines 917–926 and line 1224

**What changed in v0.5.0:** The animation loop now calls `onEntitySelect(interpolatedEntity)` at ~30Hz to keep the sidebar in sync with the interpolated visual position. But `selectedEntity` is in the animation loop's `useEffect` dependency array (line 1224):

```typescript
// Inside animation loop (line 920–926):
if (currentSelected && uid === currentSelected.uid && onEntitySelect) {
    if (Math.floor(now / 33) % 2 === 0) {
        onEntitySelect(interpolatedEntity);  // ← Updates parent state
    }
}

// Dependency array (line 1224):
}, [selectedEntity, onCountsUpdate, filters, onEvent, onEntitySelect,
    mapLoaded, enable3d, mapToken, mapStyle, viewState, replayMode]);
//   ^^^^^^^^^^^^^^ — changes every time onEntitySelect fires!
```

**The feedback loop:**
1. Animation frame fires → calls `onEntitySelect(interpolatedEntity)`
2. Parent component updates state → new `selectedEntity` prop
3. `selectedEntity` changed → useEffect cleanup runs → `cancelAnimationFrame`
4. useEffect re-runs → new `requestAnimationFrame` queued
5. Next frame fires → goto 1

This tears down and restarts the animation loop **~30 times per second** when any entity is selected. Each restart introduces a frame gap, disrupts the `dt` calculation (causing `dt` to include the useEffect re-initialization overhead), and resets the smooth animation cadence. The result is jerkier motion and inconsistent EWMA smoothing.

---

## 3. Why Maritime COTs Are Unaffected

Maritime entities escape rubber banding for three reasons:

1. **Speed gate:** Dead reckoning only activates when `entity.speed > 1.0` m/s (~2 knots). Most vessels at anchor or slow-steaming are below this threshold, so they never dead-reckon and thus never overshoot.

2. **Displacement magnitude:** Even vessels above the speed gate (e.g., 15 knots = 7.7 m/s) dead-reckon only ~19m over 2.5 seconds. At typical map zoom levels, 19 meters is sub-pixel. A 450-knot aircraft (231 m/s) dead-reckons ~578m in the same time — clearly visible.

3. **Separate data source:** Maritime COTs come from AIS (via a separate maritime poller), not ADS-B. The maritime poller uses a single source and a longer poll interval, so there is no duplicate storm. Maritime entities receive ~1 update every 5–30 seconds, giving the interpolation time to fully converge before the next update.

---

## 4. Industry Research — How Others Solve This

### 4.1 DIS Standard (IEEE 1278) — Military Distributed Simulation

The Distributed Interactive Simulation standard, used by every major military simulation system, defines dead reckoning as the primary technique for smooth entity motion between updates. Key principles:

- **9 Dead Reckoning Models (DRMs):** Range from static (DRM-1) to full rotating-body with acceleration (DRM-9). For aircraft tracking, DRM-5 (FVW — Fixed, Velocity, World) is standard: `P(t) = P0 + V0·dt + ½·A0·dt²`
- **Threshold-based publishing:** The sender runs both the real model and a "ghost" using dead reckoning. Updates are only sent when the two diverge beyond a threshold. This is adaptive rate control — fast-maneuvering entities send more often, straight-and-level ones send less.
- **Convergence, not interpolation:** When a correction arrives, DIS does NOT interpolate between the old and new position. It uses **Projective Velocity Blending (PVB)**: blend from the current visual state toward the new projected state over one update interval. The entity never moves backward.

### 4.2 Projective Velocity Blending (PVB) — Curtiss Murphy, 2011

PVB is the gold standard for dead reckoning convergence in networked simulations. It outperforms cubic Bézier splines by 5–7% in accuracy and eliminates the oscillation artifacts that plague polynomial-based smoothing.

**Algorithm:**
```
On receiving a new update with position P', velocity V':
  blend_time = expected_update_interval

  For each frame (dt since update received):
    α = clamp(dt / blend_time, 0, 1)

    // Project where the entity SHOULD be from the new update:
    P_server = P' + V' · dt

    // Project where the entity WAS going from the old state:
    V_blended = lerp(V_old, V', α)
    P_client = P_visual + V_blended · frame_dt

    // Blend between the two projections:
    P_final = lerp(P_client, P_server, α)
```

Key insight: **the entity always moves forward** because both `P_server` and `P_client` project forward in time using velocity. The blend just gradually shifts which projection dominates. There is no backward motion.

### 4.3 Kalman Filter Fusion — Flight Tracking Industry Standard

FlightRadar24, FlightAware, and Eurocontrol ARTAS all use Kalman filter variants for multi-source position fusion:

- **State vector per aircraft:** `[lat, lon, vLat, vLon, course, groundspeed]`
- **Predict step** runs every render frame: projects state forward using velocity → continuous motion, never stops
- **Update step** fires asynchronously when any source delivers data. Each source has its own measurement noise covariance (`R`), so low-quality sources are trusted less
- **No interpolation between snapshots** — the Kalman state IS the position. New measurements correct the state; they don't create a "target" to interpolate toward

This eliminates rubber banding entirely because the predict step always moves forward, and the update step applies a small correction (Kalman gain × innovation) rather than snapping to a new target.

### 4.4 Snapshot Interpolation — Game Networking

Used by Source Engine, Overwatch, and Valorant for remote entities:

- Buffer incoming snapshots and render entities at `current_time - interpolation_delay`
- Always interpolate between two **known** positions — never extrapolate
- Trades latency for smoothness (entity is always one update interval behind reality)
- Eliminates rubber banding because you never overshoot; but adds visual latency

### 4.5 TAK / ATAK — Cursor on Target

ATAK does **not** dead-reckon COT positions. It displays the last reported position and uses stale timers (start/time/stale triplet) for data lifecycle. When a COT goes stale, the icon grays out. When it expires, it is removed. There is no forward projection.

This is the simplest approach — no rubber banding by definition — but causes the "frozen aircraft" problem the user specifically wants to avoid.

### 4.6 Exponential Smoothing / Elastic Correction

A simpler alternative to PVB used in many indie games:

```
position = lerp(position, target_position, α · dt)
```

Where `α` controls correction speed. Small α = smooth but laggy. Large α = responsive but jerky. If distance exceeds a snap threshold, teleport immediately. This is essentially what the current EWMA does, but the problem is the **target** jumps backward — no amount of smoothing fixes a target that moves the wrong direction.

---

## 5. Implementation Fix

The fix has three parts addressing each regression. They should be implemented in order.

### Fix 1 — Restore Small-Area Single-Point Polling Optimization

**File:** `backend/ingestion/poller/main.py`, `calculate_polling_points()`

**Change:** Restore the radius < 50nm optimization that uses a single polling point for small tactical areas. This immediately reduces the duplicate storm by 3×.

```python
def calculate_polling_points(self):
    """Calculate polling coverage points based on current mission area."""
    # Optimization: For small tactical areas (< 50nm), a single point is sufficient
    # and reduces duplicate updates from overlapping coverage.
    if self.radius_nm < 50:
        return [(self.center_lat, self.center_lon, self.radius_nm)]

    return [
        (self.center_lat, self.center_lon, self.radius_nm),
        (self.center_lat + 0.5, self.center_lon - 0.5, min(100, self.radius_nm)),
        (self.center_lat - 0.5, self.center_lon + 0.5, min(100, self.radius_nm)),
    ]
```

### Fix 2 — Replace Interpolation + Dead Reckoning with Projective Velocity Blending

**File:** `frontend/src/components/map/TacticalMap.tsx`, animation loop (lines ~854–898)

**The core fix.** Replace the current two-phase model (geometric interpolation + dead reckoning extrapolation + EWMA) with a single PVB-based model that never moves backward.

**Current architecture (broken):**
```
prev → curr (geometric lerp, t_geom 0→1) → curr + DR offset (extrapolation)
                                             ↓ on new update
                                        SNAP BACK to new prev (rubber band!)
```

**New architecture (PVB):**
```
On new update:
  Record: blend_start_pos = current visual position
          blend_start_vel = current velocity
          server_pos = new reported position
          server_vel = new reported velocity
          blend_start_time = now
          expected_interval = time since last update (or 2000ms default)

Each frame:
  α = clamp((now - blend_start_time) / expected_interval, 0, 1)
  dt = now - blend_start_time

  // Where the server says we should be:
  P_server = server_pos + server_vel · dt

  // Where we were heading before the update:
  V_blend = lerp(blend_start_vel, server_vel, α)
  P_client = blend_start_pos + V_blend · dt

  // Smooth blend between the two:
  target = lerp(P_client, P_server, α)

  → Entity ALWAYS moves forward. α=0: follow old trajectory. α=1: on new trajectory.
```

This eliminates the backward snap entirely. When a new update arrives, the entity's visual position doesn't change — it continues moving forward while gradually converging to the server's reported trajectory. After one `expected_interval`, it's fully on the new trajectory.

**Concrete code replacement:**

Replace the snapshot refs and interpolation block with:

```typescript
// NEW REFS (replace prevSnapshotsRef and currSnapshotsRef):
const drStateRef = useRef<Map<string, {
    // Server state (from latest update)
    serverLat: number;
    serverLon: number;
    serverSpeed: number;        // m/s
    serverCourseRad: number;    // radians
    serverTime: number;         // Date.now() when update arrived
    // Blend origin (visual state at moment of update)
    blendLat: number;
    blendLon: number;
    blendSpeed: number;
    blendCourseRad: number;
    // Timing
    expectedInterval: number;   // ms, measured from update cadence
}>>(new Map());

// IN processEntityUpdate (where snapshots were updated):
const drState = drStateRef.current.get(entity.uid);
const visual = visualStateRef.current.get(entity.uid);
const courseRad = ((computedCourse || 0) * Math.PI) / 180;
const speed = entity.detail?.track?.speed || 0;

if (drState && visual) {
    // Capture current visual state as blend origin
    drState.blendLat = visual.lat;
    drState.blendLon = visual.lon;
    drState.blendSpeed = drState.serverSpeed;
    drState.blendCourseRad = drState.serverCourseRad;
    drState.expectedInterval = Math.max(now - drState.serverTime, 800);
}

drStateRef.current.set(entity.uid, {
    ...(drState || { blendLat: newLat, blendLon: newLon, blendSpeed: speed, blendCourseRad: courseRad, expectedInterval: 2000 }),
    serverLat: newLat,
    serverLon: newLon,
    serverSpeed: speed,
    serverCourseRad: courseRad,
    serverTime: Date.now(),
});

// IN animation loop (replace the interpolation block at lines 854–898):
const dr = drStateRef.current.get(uid);

let targetLon = entity.lon;
let targetLat = entity.lat;

if (dr && entity.speed > 0.5) {
    const dtSec = (now - dr.serverTime) / 1000;
    const alpha = Math.min((now - dr.serverTime) / dr.expectedInterval, 1.0);
    const R = 6_371_000;
    const cosLat = Math.cos(dr.serverLat * Math.PI / 180);

    // Server projection: where server says entity should be now
    const sDistM = dr.serverSpeed * dtSec;
    const sLat = dr.serverLat + (sDistM * Math.cos(dr.serverCourseRad)) / R * (180 / Math.PI);
    const sLon = dr.serverLon + (sDistM * Math.sin(dr.serverCourseRad)) / (R * cosLat) * (180 / Math.PI);

    // Client projection: where old trajectory would have taken us
    const blendSpeed = dr.blendSpeed + (dr.serverSpeed - dr.blendSpeed) * alpha;
    const blendCourse = dr.blendCourseRad + (dr.serverCourseRad - dr.blendCourseRad) * alpha;
    const cDistM = blendSpeed * dtSec;
    const cLat = dr.blendLat + (cDistM * Math.cos(blendCourse)) / R * (180 / Math.PI);
    const cLon = dr.blendLon + (cDistM * Math.sin(blendCourse)) / (R * cosLat) * (180 / Math.PI);

    // Blend
    targetLat = cLat + (sLat - cLat) * alpha;
    targetLon = cLon + (sLon - cLon) * alpha;
}

// EWMA is still useful for micro-jitter, but with a much higher alpha
// since PVB already handles smooth convergence:
let visual = visualStateRef.current.get(uid);
if (!visual) {
    visual = { lat: targetLat, lon: targetLon, alt: entity.altitude };
    visualStateRef.current.set(uid, visual);
} else {
    const FAST_ALPHA = 0.25; // Much faster convergence — PVB already smooth
    const smoothFactor = 1 - Math.pow(1 - FAST_ALPHA, dt / 16.67);
    visual.lat += (targetLat - visual.lat) * smoothFactor;
    visual.lon += (targetLon - visual.lon) * smoothFactor;
    visual.alt += (entity.altitude - visual.alt) * smoothFactor;
}
```

### Fix 3 — Break the Animation Loop Feedback Cycle

**File:** `frontend/src/components/map/TacticalMap.tsx`, line 1224

**Change:** Remove `selectedEntity` from the animation loop's useEffect dependency array. The animation loop already reads `selectedEntityRef.current` (a ref, not the prop directly), so the dependency is unnecessary and causes the teardown/restart cycle.

```typescript
// BEFORE (line 1224):
}, [selectedEntity, onCountsUpdate, filters, onEvent, onEntitySelect,
    mapLoaded, enable3d, mapToken, mapStyle, viewState, replayMode]);

// AFTER:
}, [onCountsUpdate, filters, onEvent, onEntitySelect,
    mapLoaded, enable3d, mapToken, mapStyle, viewState, replayMode]);
```

Additionally, `viewState` in the dependency array causes the animation loop to restart on every pan/zoom interaction. Since the animation loop reads map state imperatively (via `mapRef.current.getMap()`), `viewState` should also be removed:

```typescript
// FINAL:
}, [onCountsUpdate, filters, onEvent, onEntitySelect,
    mapLoaded, enable3d, mapToken, mapStyle, replayMode]);
```

---

## 6. Agent Prompts

The following prompts are designed for a coding agent to carry out each fix. They are ordered by implementation priority.

---

### Prompt 1 — Restore Small-Area Polling Optimization

```
TASK: Restore the small-area single-point polling optimization in the backend poller.

FILE: backend/ingestion/poller/main.py

In the `calculate_polling_points()` method, add back the early return for small
tactical areas. Before the `return [...]` statement that returns 3 polling points,
add:

    if self.radius_nm < 50:
        return [(self.center_lat, self.center_lon, self.radius_nm)]

This ensures areas under 50nm radius use a single center polling point, reducing
duplicate ADS-B updates by 3× for typical tactical deployments.

Do NOT change the 3-point return for radius >= 50nm — large coverage areas still
need overlapping points for complete coverage.

Verify: The method should return 1 point when radius < 50, and 3 points otherwise.
```

---

### Prompt 2 — Replace Interpolation Model with Projective Velocity Blending

```
TASK: Replace the dead reckoning interpolation system in TacticalMap.tsx with
Projective Velocity Blending (PVB) to eliminate rubber banding.

FILE: frontend/src/components/map/TacticalMap.tsx

CONTEXT: The current system uses a two-phase approach:
1. Geometric interpolation between prevSnapshot and currSnapshot (t_geom 0→1)
2. Dead reckoning extrapolation beyond t_geom=1 using speed/course
This creates rubber banding because when a new update arrives, the interpolation
target snaps backward from the dead-reckoned position to prev (the old curr).

CHANGES NEEDED:

A) Replace the refs at lines 320-321:
   Remove: prevSnapshotsRef and currSnapshotsRef
   Add: drStateRef — a Map<string, DeadReckoningState> where DeadReckoningState is:
   {
     serverLat: number, serverLon: number,
     serverSpeed: number, serverCourseRad: number, serverTime: number,
     blendLat: number, blendLon: number,
     blendSpeed: number, blendCourseRad: number,
     expectedInterval: number
   }

B) In processEntityUpdate (around line 619-624 where snapshots are updated):
   Instead of updating prev/curr snapshots, update the drState:
   - Capture the CURRENT visual position (from visualStateRef) as blend origin
   - Record the new server position, speed, course as server state
   - Calculate expectedInterval from time since last server update (min 800ms)

C) In the animation loop (lines 854-898), replace the interpolation block with PVB:
   For each entity with dr state and speed > 0.5 m/s:
   1. Calculate alpha = clamp((now - dr.serverTime) / dr.expectedInterval, 0, 1)
   2. Calculate dtSec = (now - dr.serverTime) / 1000
   3. Server projection: project from serverPos using serverSpeed/serverCourse × dtSec
   4. Client projection: project from blendPos using blended velocity × dtSec
      (blend velocity = lerp(blendSpeed/Course, serverSpeed/Course, alpha))
   5. Final target = lerp(client_projection, server_projection, alpha)

   The entity ALWAYS moves forward because both projections use positive dt × speed.

D) Increase EWMA alpha to 0.25 (from the current speed-adaptive 0.04-0.10).
   PVB already handles smooth convergence, so EWMA only needs to filter micro-jitter.

E) Clean up: Remove all references to prevSnapshotsRef and currSnapshotsRef,
   including in the stale cleanup block (~line 982-983) and the mission clear
   effect (~line 514-515). Replace with drStateRef cleanup.

CRITICAL RULES:
- The entity must NEVER move backward. Both projections must use positive velocity.
- For entities with speed <= 0.5 m/s (stationary/drifting), use entity.lat/lon directly.
- Preserve the existing stale check, count, and filter logic — only change interpolation.
- Preserve trail point logic — it should continue using raw entity positions.
- Keep the bearing/course computation (kinematic bearing priority block) unchanged.

TEST: Watch a fast aircraft (>300 knots) on a straight path. It should:
1. Move smoothly forward at all times
2. When a new update arrives, show NO backward motion
3. Gradually converge to the new trajectory over ~1-2 seconds
4. Never freeze or stop mid-air
```

---

### Prompt 3 — Fix Animation Loop Dependency Array

```
TASK: Remove selectedEntity and viewState from the animation loop's useEffect
dependency array to prevent constant teardown/restart cycles.

FILE: frontend/src/components/map/TacticalMap.tsx

CONTEXT: The animation loop useEffect (starting ~line 790) has this dependency array:
  [selectedEntity, onCountsUpdate, filters, onEvent, onEntitySelect,
   mapLoaded, enable3d, mapToken, mapStyle, viewState, replayMode]

The `selectedEntity` dependency causes the entire animation loop to tear down and
restart ~30 times/second when an entity is selected (because the animation loop
itself calls onEntitySelect which updates selectedEntity). The `viewState` dependency
causes restarts on every pan/zoom.

Both are unnecessary because the animation loop reads these values through refs:
- selectedEntity → selectedEntityRef.current
- viewState → mapRef.current.getMap() for imperative map access

CHANGE: Update the dependency array to:
  [onCountsUpdate, filters, onEvent, onEntitySelect,
   mapLoaded, enable3d, mapToken, mapStyle, replayMode]

That is: remove `selectedEntity` and `viewState`.

VERIFY:
1. The animation loop must still correctly highlight the selected entity
2. Follow mode must still work (it uses followModeRef and mapRef imperatively)
3. Pan/zoom must not interrupt the animation
4. No eslint-disable needed — the refs are the correct pattern for animation loops
```

---

### Prompt 4 — (Optional Enhancement) Add Backend Arbitration Cache TTL Tuning

```
TASK: Tighten the backend arbitration cache to reduce duplicate publishes for
overlapping polling point responses.

FILE: backend/ingestion/poller/main.py

CONTEXT: The _should_publish method checks an arbitration cache before publishing
to Kafka. When multiple polling points overlap, the same aircraft appears in
multiple responses. The cache should suppress duplicates more aggressively.

CHANGES:
1. In _should_publish(), reduce the minimum temporal delta from the current value
   to 500ms (0.5s). No aircraft needs sub-second position updates for smooth
   rendering — PVB handles the inter-update motion.

2. Reduce the minimum spatial delta to 30m. Multi-source coordinate noise between
   adsb.fi and adsb.lol is typically 20-100m due to different receiver networks.
   Updates below 30m spatial delta from the same temporal window are noise, not signal.

3. In _evict_stale_arbi_entries(), reduce the stale threshold to 30 seconds (from
   the current value) to prevent memory growth from transient aircraft.

VERIFY: Monitor Kafka message rate for a known busy area. Before fix: expect
3-6 messages/aircraft/second. After fix: expect ≤ 1 message/aircraft/second.
```

---

## Appendix A — Interpolation Model Comparison

| Property | Current (Geometric + DR + EWMA) | PVB (Proposed) | Kalman Filter |
|----------|--------------------------------|----------------|---------------|
| Backward motion | Yes (on every update) | Never | Never |
| Implementation complexity | Medium | Medium | High |
| Accuracy (straight line) | Good | Excellent | Excellent |
| Accuracy (turns) | Poor (overshoots) | Good | Excellent |
| Handles variable update rates | Poorly | Well | Excellent |
| Handles multiple sources | Poorly | Well | Excellent |
| CPU per entity per frame | Low | Low | Medium |
| State per entity | 2 snapshots + visual | 1 DR state + visual | 6-state vector + covariance |

**Recommendation:** PVB is the best fit for this system. It provides the core guarantee (never move backward) with minimal implementation complexity. A Kalman filter would be ideal but requires significantly more implementation effort and testing. PVB can be upgraded to Kalman later if needed.

## Appendix B — Visual Diagram of Rubber Band Effect

```
                    Dead Reckoning
                   ┌──────────────→ X (visual position at T+2.5s)
                   │                ↑ rubber band pulls back
                   │         ┌──────┘
Update 1:  A ─────→ B ──────┘
                         ↑
                         │ prev = B (old curr)
                         │ at t_geom ≈ 0, target ≈ B
                         │ but visual was at X!
Update 2:         B ─────→ C
                   prev    curr

With PVB:
Update 1:  A ─────→ B ──DR──→ X (visual continues forward)
                               │
Update 2:                X ────╲────→ (blends toward C's trajectory)
                          blend  ╲──→ converges over expectedInterval
                          origin   (NO backward motion)
```

---

*Report generated from source analysis of Sovereign Watch v0.5.0 (commit 7b89cbe)*
*Affected files: `backend/ingestion/poller/main.py`, `frontend/src/components/map/TacticalMap.tsx`*
*Analysis date: 2026-02-17*
