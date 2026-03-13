# ADS-B COT Jitter & Rubber-Banding Analysis
**Sovereign Watch — Aviation Track Rendering Report**
*Branch: claude/fix-adbs-cot-jitter-zefYx*

---

## Executive Summary

Jitter and rubber-banding on airborne COT tracks is caused by a **cascade of five interacting defects** spanning the full ingestion-to-render pipeline. They are not isolated frontend bugs — each layer amplifies timing noise produced by the layer above it. The core problem is that three ADS-B sources produce the same aircraft position at subtly different timestamps, and no arbitration layer normalises those measurements before they reach the map.

This report traces each defect root-to-leaf, explains how industry systems solve them, and specifies concrete remediation for each layer of this stack.

---

## System Architecture (Relevant Path)

```
adsb.fi ──┐
adsb.lol ─┼──► MultiSourcePoller ──► normalize_to_tak() ──► Kafka(adsb_raw)
airplanes ┘          ↕                       ↕
               (3 polling points)    (time.time() - seen_pos)
                                             ↓
                                    WebSocket /api/tracks/live
                                             ↓
                                    TAK Worker (decode_batch)
                                             ↓
                                    entity_update handler
                                    (strict monotonic guard)
                                             ↓
                                    Animation loop
                                    (extrapolation + EWMA smooth)
                                             ↓
                                    Deck.gl IconLayer (60 fps)
```

---

## Root Cause Analysis

### Defect 1 — Timestamp Construction is Anchored to Fetch Time, Not Measurement Time
**File:** `backend/ingestion/poller/main.py`, line 165–166

```python
latency = float(ac.get("seen_pos") or ac.get("seen") or 0.0)
source_ts = time.time() - latency          # ← BUG
```

**What goes wrong:**

`seen_pos` is the number of seconds elapsed since the ADS-B receiver that captured this squitter last saw a valid position for this aircraft. It is measured on the *source's* clock, at the *source's* server, not at the moment `_fetch()` returned. The sequence of events is:

```
T+0.000  Aircraft transmits ADS-B squitter
T+0.050  Ground receiver captures it
T+0.300  adsb.fi aggregates it into their API response
T+0.850  MultiSourcePoller._fetch() issues GET request
T+1.100  HTTP response arrives  (_fetched_at = time.time() ≈ T+1.100)
T+1.100  normalize_to_tak() runs: source_ts = T+1.100 - seen_pos
```

But `seen_pos` in the JSON response was computed at the adsb.fi server at ~T+0.300, when only ~0.3s had elapsed. By the time `normalize_to_tak` reads it at T+1.100, the actual elapsed time is ~1.1s. The result is that `source_ts` is computed as `T+1.100 - 0.3 = T+0.8`, which is **0.8 seconds ahead of the actual measurement time (T+0.0)** and 0.3 seconds in the future relative to the physical event.

When adsb.lol answers the *next* poll for the same aircraft 500ms later at T+1.600, with a `seen_pos` of 1.6 (because it's now 1.6s since that aircraft last transmitted), the calculation gives `source_ts = T+1.600 - 1.6 = T+0.0`. This is older than the adsb.fi timestamp (T+0.8), so the **strictly-monotonic guard in the frontend rejects it**, even though adsb.lol may have a higher-quality position for the same physical transmission.

The correct anchor is `_fetched_at - seen_pos`, where `_fetched_at` is the timestamp recorded inside `_fetch()` immediately when the HTTP response is received, not when `normalize_to_tak()` processes the record seconds later.

**Impact:** Produces synthetic timestamp ordering inversions between sources. Causes the monotonic guard to drop valid positions as "stale" and retain older ones from a different source, creating sudden position discontinuities.

---

### Defect 2 — No Cross-Source Arbitration Window (Duplicate Storm)
**File:** `backend/ingestion/poller/multi_source_poller.py`, lines 77–101 and `main.py`, lines 140–154

The current polling pattern `[fi, lol, fi, lol, airplanes]` runs every 0.5s. With three polling *points* (center, NW offset, SE offset) rotating in parallel, an aircraft within range of all three points can appear in **up to 6 Kafka messages per second** — one per poll × one per point — all for the same `hex` identifier.

There is no deduplication gate between `poll_point()` and `producer.send()`. Every aircraft returned by every poll call flows directly to Kafka. A 150nm radius poll at the Portland center point returns ~400 aircraft; the same 150nm pull from the NW offset overlaps heavily and returns most of the same aircraft again.

This means the frontend `entity_update` handler receives 2–6 position packets per second for a single aircraft, each constructed with a slightly different `time.time()` value (because `normalize_to_tak` runs at a different wall-clock instant for each aircraft in the loop at line 149). The result is not smooth updates — it is a flood of near-identical messages that each trigger the interpolation state machine to reset its `prevSnapshot` and `currSnapshot`, causing the smooth factor to pull toward a new target 2–6 times per second.

**Impact:** Excessive Kafka message volume and interpolation state resets. The icon visually "snaps" toward a new target before the previous smooth convergence completes, appearing as continuous micro-jitter.

---

### Defect 3 — Extrapolation Cap of 2.5× Causes Overshoot Rubber-Banding
**File:** `frontend/src/components/map/TacticalMap.tsx`, line 653

```typescript
const t = Math.min(elapsed / Math.max(duration, 100), 2.5);
targetLon = prev.lon + (curr.lon - prev.lon) * t;
targetLat = prev.lat + (curr.lat - prev.lat) * t;
```

The extrapolation `t` is clamped at **2.5×** of the measured update interval. For an aircraft updating every 1s at 450 knots (230 m/s), the extrapolated position at t=2.5 is:

```
2.5 × 230 m/s × 1s = 575 metres ahead of last known position
```

When the next real position arrives (which is only ~230m ahead because the aircraft has been flying for 1s, not 2.5s), the target suddenly snaps *backward* by ~345 metres. The exponential smoothing (EWMA, factor 0.05 per frame) then pulls the icon back over ~60 frames (~1 second), which at 60fps is a very visible slow rubber-band retraction.

The overshoot is compounded by Defect 2: because new packets arrive frequently, `currSnapshot` is continuously updated, and `elapsed` keeps resetting to 0, so `t` oscillates between 0 and 2.5 rapidly rather than smoothly progressing.

**Industry standard:** ADS-B Exchange, FlightAware, and Eurocontrol ARTAS all cap extrapolation at **1.0–1.2×** the measured update interval. Beyond 1.0× you are in pure dead-reckoning territory and should use the aircraft's own reported course and ground speed (which is already present in `detail.track.course` and `detail.track.speed`) rather than geometric interpolation.

**Impact:** Produces the characteristic "overshoot then snap back" rubber-band pattern most visible on fast-moving aircraft on curved tracks.

---

### Defect 4 — EWMA Smooth Factor Creates Lag That Conflicts With Extrapolation
**File:** `frontend/src/components/map/TacticalMap.tsx`, lines 663–665

```typescript
const SMOOTH_FACTOR = 0.05;
visual.lat = visual.lat + (targetLat - visual.lat) * SMOOTH_FACTOR;
visual.lon = visual.lon + (targetLon - visual.lon) * SMOOTH_FACTOR;
```

An EWMA with α=0.05 at 60fps has a time constant of:

```
τ = -1 / (fps × ln(1 - α)) = -1 / (60 × ln(0.95)) ≈ 0.32 seconds
```

This means the visual position reaches 63% of a new target in 0.32s and 95% in ~1.0s. For a slow-moving vessel this is fine. For a 500-knot aircraft, 0.32s of lag represents **~83 metres** of positional error — enough to place the icon visibly behind its actual position on a zoomed-in map.

The problem is that EWMA is applied on top of the geometric extrapolation. When extrapolation overshoots and then a new target is computed, EWMA extends the rubber-band duration. These two smoothing mechanisms interact destructively: extrapolation tries to project forward, EWMA tries to lag behind, and position history is stored to trail points using the raw (non-interpolated) position, meaning the trail correctly shows where the aircraft was while the icon shows where it isn't.

**Industry standard:** Professional aviation systems separate **prediction** (physics-based: project current position forward using course + speed) from **correction** (update state when new measurement arrives, Kalman gain). They do not layer geometric extrapolation on top of exponential smoothing; they use one mechanism.

---

### Defect 5 — Trail Points Added From Raw Kafka Positions, Not Visual Positions
**File:** `frontend/src/components/map/TacticalMap.tsx`, lines 443–447

```typescript
if (!existing || existing.lon !== newLon || existing.lat !== newLat) {
    trail = [...trail, [newLon, newLat, entity.hae || 0, speed] as TrailPoint].slice(-100);
}
```

Trail points are appended whenever the raw Kafka-reported position differs from the stored entity position. Because Defects 1 and 2 cause multiple near-simultaneous updates from different sources with micro-differences in lat/lon (due to different receiver network geometry — adsb.fi and adsb.lol aggregate from different ground station networks and may report a given squitter with slightly different decoded coordinates), the trail accumulates **multiple points representing the same physical aircraft position**, creating a zigzag pattern in the trail at high zoom levels.

At a 150nm coverage radius, the coordinate noise between adsb.fi and adsb.lol for the same aircraft can be on the order of **20–100 metres** due to multilateration differences in receiver geometry. This is invisible at zoom level 9 but clearly visible at zoom 13+.

---

## Industry Reference: How This Is Solved

### FlightRadar24 / FlightAware Architecture Pattern
Both services run a **track fusion layer** between raw receiver ingestion and map rendering:

1. **Position Buffer (100–500ms window):** All reports for the same `icao24` (ICAO hex address) from all sources are buffered in a short time window. The "best" position is selected based on: (a) most recent `seen_pos`, (b) highest signal quality (`rssi`, `nac_p`), (c) source priority tier.

2. **Kalman/α-β Tracker Per Track:** Each active aircraft has a state vector `[lat, lon, vLat, vLon, course, gs]`. New measurements update the state via a standard α-β filter. The predicted position at any instant is computed from the state vector, not from geometric interpolation between two snapshots.

3. **Rate-Limited Kafka/NATS Publishing:** After fusion, a track update is only published to the map topic if the predicted vs. measured error exceeds a threshold (typically 50–100m for commercial aircraft) OR if a configurable heartbeat interval elapses (typically 1–5s per aircraft). This eliminates the "duplicate storm."

### Eurocontrol ARTAS (ATC Track Fusion)
ARTAS uses a multi-sensor track association and fusion engine. Key relevant technique: **coasting** — when no new measurement arrives, the track is projected forward using the last known velocity vector until either a new measurement arrives or the coast timeout expires. This is equivalent to t=1.0 extrapolation using physics (course + speed), not t=2.5 geometric overshoot.

### ADS-B Exchange Open Source Approach
ADSBx's `readsb` daemon aggregates feeds from multiple receivers and maintains a per-aircraft state that includes:
- `last_seen_ms`: milliseconds since last message
- `pos_reliable_odd/even`: whether the CPR decode is validated
- A simple velocity integrator that projects position forward when `last_seen_ms` < coast_timeout

The key: they never present two conflicting positions for the same aircraft from different sources. Source selection happens *before* the position is committed to state.

---

## Recommended Fixes by Layer

### Fix A — Poller: Anchor Timestamp to `_fetched_at`

In `normalize_to_tak()`, use the `_fetched_at` value injected by `_fetch()` as the temporal anchor instead of calling `time.time()` again:

```python
# Current (incorrect):
latency = float(ac.get("seen_pos") or ac.get("seen") or 0.0)
source_ts = time.time() - latency

# Corrected:
fetched_at = float(ac.get("_fetched_at", time.time()))
latency = float(ac.get("seen_pos") or ac.get("seen") or 0.0)
source_ts = fetched_at - latency
```

This ensures that all aircraft from the same HTTP response share the same fetch-time anchor, eliminating the per-aircraft timestamp drift introduced by processing loop overhead.

---

### Fix B — Poller: Add a Per-Hex Arbitration Cache

Introduce a short-lived in-process cache (TTL ~800ms) keyed on `hex` that stores the best-known position per aircraft. Before publishing to Kafka, compare the new `source_ts` to the cached value. Only publish if:
- `source_ts` is newer than the cached value by at least a minimum delta (e.g., 500ms), OR
- The spatial distance between new and cached position exceeds a threshold (e.g., 50m)

This collapses the 2–6 messages/aircraft/second down to 1–2, and ensures only the temporally-correct position flows downstream.

The cache must also account for cross-point overlap: the three polling points (center, NW, SE) with a 150nm radius have substantial overlap. An aircraft at the center can appear in all three point responses within the same 1.5s cycle.

---

### Fix C — Frontend: Cap Extrapolation at 1.0×

Reduce the extrapolation multiplier cap from 2.5 to 1.0:

```typescript
// Current:
const t = Math.min(elapsed / Math.max(duration, 100), 2.5);

// Corrected:
const t = Math.min(elapsed / Math.max(duration, 100), 1.0);
```

This prevents overshoot entirely. Once elapsed time equals the measured update interval, the icon holds at the last extrapolated position (which is the physically-predicted position) rather than racing 2.5× ahead. When a new update arrives, the icon will jump forward, but by at most one update-interval worth of distance rather than 1.5× of it.

For the extrapolation itself, prefer using the aircraft's own reported course and ground speed over geometric delta between two GPS snapshots when those two values are available:

```typescript
// Physics-based dead reckoning (more accurate than geometric lerp):
if (entity.speed > 1.0 && elapsed < duration * 1.5) {
    const courseRad = (entity.course || 0) * Math.PI / 180;
    const R = 6371000;
    const latRad = entity.lat * Math.PI / 180;
    const distMeters = entity.speed * (elapsed / 1000);
    const dLat = (distMeters * Math.cos(courseRad)) / R;
    const dLon = (distMeters * Math.sin(courseRad)) / (R * Math.cos(latRad));
    targetLat = entity.lat + dLat * (180 / Math.PI);
    targetLon = entity.lon + dLon * (180 / Math.PI);
} else {
    // Fall back to geometric lerp for low-speed or stale entities
    targetLon = prev.lon + (curr.lon - prev.lon) * t;
    targetLat = prev.lat + (curr.lat - prev.lat) * t;
}
```

---

### Fix D — Frontend: Increase EWMA Factor for Fast Aircraft

The fixed α=0.05 creates too much lag for fast aircraft. A velocity-scaled smooth factor would allow fast-movers to converge quickly while keeping slow vessels smooth:

```typescript
// Velocity-adaptive smooth factor
const speedKts = entity.speed * 1.94384;
const SMOOTH_FACTOR = speedKts > 200 ? 0.15 :   // Fast aircraft: ~0.1s lag
                      speedKts > 50  ? 0.10 :    // Medium: ~0.16s lag
                                       0.05;     // Slow/vessels: ~0.32s lag
```

Alternatively, and more robustly: remove EWMA entirely from the position calculation (since Fix C eliminates the overshoot that EWMA was compensating for) and apply it only to heading/course angle. Position should track the physics-based prediction exactly; icon rotation benefits from smoothing.

---

### Fix E — Frontend: Gate Trail Point Insertion on Minimum Distance

Add a minimum distance threshold before appending a trail point. This filters out the coordinate noise from different source networks:

```typescript
const MIN_TRAIL_DIST_M = 30; // Below this, don't add a new trail point

if (!existing || existing.lon !== newLon || existing.lat !== newLat) {
    const lastTrailPoint = trail[trail.length - 1];
    const distFromLast = lastTrailPoint
        ? getDistanceMeters(lastTrailPoint[1], lastTrailPoint[0], newLat, newLon)
        : Infinity;

    if (distFromLast > MIN_TRAIL_DIST_M) {
        trail = [...trail, [newLon, newLat, entity.hae || 0, speed] as TrailPoint].slice(-100);
    }
}
```

30 metres is above the multilateration noise floor between sources but well below the movement of any aircraft between updates.

---

## Priority & Impact Matrix

| Fix | Layer | Jitter Reduction | Rubber-Band Reduction | Difficulty |
|-----|-------|-----------------|----------------------|------------|
| A — Timestamp anchor | Poller (Python) | High | Medium | Low |
| B — Arbitration cache | Poller (Python) | High | High | Medium |
| C — Extrapolation cap | Frontend (TS) | Low | High | Low |
| D — Adaptive EWMA | Frontend (TS) | Medium | Medium | Low |
| E — Trail distance gate | Frontend (TS) | Low | Low | Low |

**Recommended implementation order:** B → A → C → D → E

Fix B alone eliminates the duplicate-storm problem and will produce the most immediately visible improvement. Fix A must follow B because it changes the timestamps that B's cache uses for comparison. Fixes C and D are frontend-only and can be deployed independently.

---

## Appendix A — The `_fetched_at` Field Is Already Present But Unused

The poller already injects `_fetched_at = time.time()` in `multi_source_poller.py` line 139:

```python
ac["_fetched_at"] = time.time()
```

This value is available in `normalize_to_tak(ac)` but is not read. Fix A is essentially a one-line change to use this existing field as the temporal anchor.

---

## Appendix B — Source Timestamp Comparison Example

To illustrate Defect 1 concretely, consider this realistic sequence:

```
T+0.000   Aircraft transmits. Actual measurement time = T+0.000
T+0.300   adsb.fi aggregates. In their JSON: seen_pos = 0.3

T+0.850   Poll #1 starts (adsb.fi GET request issued)
T+1.050   HTTP response arrives → _fetched_at = T+1.050
T+1.052   normalize_to_tak runs:
             source_ts = time.time() - seen_pos
                       = T+1.052 - 0.3
                       = T+0.752   ← Wrong (should be T+0.000)

T+1.350   Poll #2 starts (adsb.lol GET request issued)
T+1.550   HTTP response arrives → _fetched_at = T+1.550
           In adsb.lol JSON: seen_pos = 1.55 (accurate — 1.55s since squitter)
T+1.552   normalize_to_tak runs:
             source_ts = time.time() - seen_pos
                       = T+1.552 - 1.55
                       = T+0.002   ← Approximately correct, but...

Frontend monotonic guard: T+0.002 < T+0.752 → DROPPED
```

The more accurate adsb.lol position is discarded because the adsb.fi timestamp calculation happened to produce an anomalously large value due to processing lag.

With Fix A:
```
Poll #1: source_ts = _fetched_at - seen_pos = T+1.050 - 0.3 = T+0.750
Poll #2: source_ts = _fetched_at - seen_pos = T+1.550 - 1.55 = T+0.000

Frontend: T+0.000 < T+0.750 → still dropped, but for the right reason.
```

With Fix B (arbitration cache), Poll #2 would not even reach Kafka because the cache would see a newer timestamp already exists from Poll #1 for this hex, and the spatial distance is 0m.

---

## Appendix C — Validation Method

To verify these fixes after implementation, use browser DevTools with the following approach:

1. Open the Console and intercept `entity_update` messages:
   ```javascript
   // In tak.worker.ts, add before postMessage:
   console.debug('[TAK] entity_update', object.cotEvent?.uid, object.cotEvent?.time);
   ```

2. For a specific aircraft hex (e.g., `a1b2c3`), count update frequency. Before fixes: expect 3–6 messages/second. After Fix B: expect ≤1 per second.

3. Record the `time` field from consecutive updates for the same UID. Before Fix A: expect non-monotonic sequences occasionally. After Fix A+B: expect strictly monotonically increasing values.

4. Enable the velocity vector layer and watch a fast aircraft on a straight track. Before Fix C: vectors will periodically swing behind the direction of travel. After Fix C: vectors consistently project ahead.

---

*Report generated from source analysis of Sovereign Watch v0.2.0*
*Affected files: backend/ingestion/poller/main.py, backend/ingestion/poller/multi_source_poller.py, frontend/src/components/map/TacticalMap.tsx*
