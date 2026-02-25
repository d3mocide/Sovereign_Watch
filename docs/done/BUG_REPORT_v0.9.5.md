# Post-Refactor Bug Report — v0.9.5

> Static analysis of the TacticalMap modularization (PR #10) and backend poller refactor (PR #9).
> Severity: 🔴 Critical → 🟠 High → 🟡 Medium → 🔵 Low

---

## 🔴 Critical

### BUG-01 — Missing `import os` in `backend/api/main.py`
**File:** `backend/api/main.py:16`

```python
ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "...").split(",")]
```

`os` is never imported. This is a `NameError` on API startup — the entire backend will fail to launch. Easy fix, high blast radius.

---

### BUG-02 — Redis Key Mismatch: Aviation vs Maritime Poller
**Files:** `backend/ingestion/aviation_poller/service.py:58` vs `backend/ingestion/maritime_poller/service.py:73`

```python
# aviation_poller/service.py
mission_json = await self.redis_client.get("mission:active")

# maritime_poller/service.py
mission_json = await self.redis_client.get("active_mission_area")  # different key!
```

These are two different Redis keys. Maritime will **never** pick up the active mission set by the API. It will perpetually poll its default Portland bounding box regardless of what mission is configured via the UI.

---

### BUG-03 — Stale Closures in `useAnimationLoop` — AOT Shapes, Hovered Entity, Selected Entity
**File:** `frontend/src/hooks/useAnimationLoop.ts:720-732`

The `useEffect` dependency array only includes:
```ts
[onCountsUpdate, filters, onEvent, onEntitySelect, mapLoaded,
 enable3d, mapToken, mapStyle, replayMode, onEntityLiveUpdate, globeMode]
```

The `animate` RAF closure captures these values which are **absent from the dep array** and go stale:

| Stale Value | Used In | Consequence |
|---|---|---|
| `aotShapes` | `buildAOTLayers()` | AOT boundary rings don't update when mission area changes |
| `hoveredEntity` | `getOrbitalLayers()` | Orbital hover highlighting is stuck on first-render value |
| `selectedEntity` | `buildEntityLayers()` click handler | Clicking a selected entity may fail to deselect it |
| `onFollowModeChange` | Follow mode auto-disable | Stale callback if parent re-renders |

Before the refactor these were in-scope local variables in the monolithic component, refreshed on every render. After extraction to the hook, the dep array must include them or they must be converted to refs.

---

## 🟠 High

### BUG-04 — `visualStateRef` Not Cleared on Mission Area Switch
**File:** `frontend/src/hooks/useMissionArea.ts:236-252`

When the mission area changes the effect correctly clears `entitiesRef`, `knownUidsRef`, `prevCourseRef`, `drStateRef`, and `countsRef`. However, `visualStateRef` is not passed to `useMissionArea` and is therefore never cleared.

```ts
// Cleared on mission change:
entitiesRef.current.clear();
knownUidsRef.current.clear();
prevCourseRef.current.clear();
drStateRef.current.clear();

// NOT cleared (not passed to useMissionArea):
// visualStateRef.current.clear()
```

If an entity with the same UID (ICAO hex / MMSI) reappears in a new mission area, its visual position will be initialized from the stale old-area coordinates, causing a visible teleport glitch on the first few frames of the new mission.

---

### BUG-05 — Maritime `navigation_listener` Has No Retry Logic
**File:** `backend/ingestion/maritime_poller/service.py:99-120`

The maritime poller's navigation listener exits permanently on any non-`CancelledError` exception:

```python
async def navigation_listener(self):
    try:
        async for message in self.pubsub.listen():
            ...
    except asyncio.CancelledError:
        logger.info("Navigation listener cancelled")
    # Any other exception (ConnectionError, etc.) → exits silently, never recovers
```

Compare to the aviation poller which has a full exponential-backoff retry loop (`aviation_poller/service.py:93-126`). After any Redis blip, maritime stops receiving mission area updates.

---

### BUG-06 — `vesselClassification` Fields Not Mapped in `transform_to_proto`
**File:** `backend/api/services/tak.py`

Maritime vessel details (`vesselClassification`: IMO, destination, draught, length, beam, navStatus, hazardous flag) are published to Kafka in JSON but appear to not be mapped into the protobuf during WebSocket serialization. The frontend `useEntityWorker.ts:264-265` handles this with a fallback that reads from `detail.classification`, but vessel-specific fields may be silently dropped in transit.

Worth verifying end-to-end: does the Payload Inspector sidebar show IMO, destination, and ship dimensions for maritime contacts?

---

### BUG-07 — Orphaned Kafka Consumer Groups Accumulate on Broker
**File:** `backend/api/routers/tracks.py:23-30`

```python
client_id = f"api-client-{uuid.uuid4().hex[:8]}"
consumer = AIOKafkaConsumer(..., group_id=client_id)
```

Each WebSocket connection creates a unique consumer group that is **never deleted**. Every browser refresh, reconnect, or new user session permanently orphans a group on the Redpanda broker. Under sustained use these accumulate indefinitely as offset metadata.

---

## 🟡 Medium

### BUG-08 — ADS-B Categories C1/C2/C3 Mapped to Maritime CoT Type
**File:** `backend/ingestion/aviation_poller/service.py:271-272`

```python
if category == "C1" or category == "C2" or category == "C3":
    cot_type = "a-f-S-C-M"  # Sea / Maritime
```

In ADS-B, categories C1–C3 are **ground vehicles**: C1 = surface emergency vehicle, C2 = surface service vehicle, C3 = fixed ground obstruction (airport equipment, obstacles). They are not maritime vessels. Assigning them `a-f-S-C-M` will cause airport ground vehicles and fixed obstacles to appear as ship icons on the tactical map.

---

### BUG-09 — Orbital `SatrecArray` Built But Never Used for Propagation
**File:** `backend/ingestion/orbital_pulse/service.py:167-218`

`SatrecArray` is built (line 168) and stored as `self.sat_array`, but the propagation loop completely ignores it:

```python
self.sat_array = SatrecArray(self.satrecs)  # Built...

# ...but propagation uses a slow per-object Python loop:
for i, sat in enumerate(self.satrecs):
    err, pos, vel = sat.sgp4(jd, fr)
    err_ago, pos_ago, vel_ago = sat.sgp4(jd_ago, fr_ago)
```

`SatrecArray` supports a fully vectorized `sgp4_array()` call that runs in native C for all satellites simultaneously. The current loop is ~100x slower for large constellations and is likely the root cause of slow/long propagation cycles (the elapsed time is logged each cycle). `self.sat_array` is built and then never referenced again.

---

### BUG-10 — `onEvent` Instability May Cause WebSocket Reconnect Loops
**File:** `frontend/src/hooks/useEntityWorker.ts:551`

```ts
}, [onEvent]);
```

The entire WebSocket + TAK Worker lifecycle is inside a `useEffect` with `[onEvent]` as its sole dependency. If `onEvent` is an inline function or non-memoized callback in the parent, it gets a new reference on every render — tearing down and rebuilding the WebSocket every time any state changes anywhere in the tree.

Audit `onEvent` usage in `App.tsx` / `MainHud.tsx` to confirm it's wrapped in `useCallback`.

---

### BUG-11 — Maritime `pubsub.close()` vs `pubsub.aclose()` (redis-py 5.x)
**File:** `backend/ingestion/maritime_poller/service.py:93`

```python
await self.pubsub.close()  # maritime — synchronous method called in async context
```

The aviation poller uses the correct guard:
```python
await self.pubsub.aclose() if hasattr(self.pubsub, 'aclose') else await self.pubsub.close()
```

In redis-py 5.x, `close()` is synchronous and `aclose()` is the async version. Calling the sync form in `await` may produce warnings or unexpected behavior during shutdown.

---

### BUG-12 — Aviation `main.py` Uses Deprecated `asyncio.get_event_loop()`
**File:** `backend/ingestion/aviation_poller/main.py:9`

```python
loop = asyncio.get_event_loop()  # Deprecated in Python 3.10+
```

Maritime and orbital `main.py` both correctly use `asyncio.run()`. This will emit `DeprecationWarning` on Python 3.10+ and may be removed in a future release.

---

## 🔵 Low / Type Safety

### BUG-13 — `onCountsUpdate` Type Missing `orbital` Field
**File:** `frontend/src/hooks/useAnimationLoop.ts:608-613`

```ts
onCountsUpdate?.({ air: airCount, sea: seaCount, orbital: orbitalCount } as any);
```

The `TacticalMapProps.onCountsUpdate` type signature only declares `{ air: number; sea: number }`. The orbital count is smuggled through with `as any`. Any parent component that destructures this callback result strictly will silently drop the orbital count. The type should be updated to include `orbital: number`.

---

### BUG-14 — Maritime Poller No SIGTERM Handler
**File:** `backend/ingestion/maritime_poller/main.py`

Docker sends SIGTERM before SIGKILL for graceful container shutdown. The maritime `main.py` only catches `KeyboardInterrupt` (SIGINT). Without a SIGTERM handler, Docker may forcefully kill the process before the `finally` cleanup block runs, potentially leaving Kafka producer buffers unflushed. The aviation poller explicitly registers SIGTERM via `loop.add_signal_handler`.

---

## Test Checklist for Tonight

- [ ] **BUG-01** — Confirm API starts without `NameError` on `os`
- [ ] **BUG-02** — Set a mission area in UI → verify maritime poller bbox actually updates (watch maritime poller logs)
- [ ] **BUG-03a** — Change mission area → verify AOT boundary rings update on map immediately
- [ ] **BUG-03b** — Hover over a satellite → move cursor away → verify hover ring clears
- [ ] **BUG-03c** — Select an entity → click it again → verify it deselects (toggle works)
- [ ] **BUG-04** — Switch mission area while an entity is visible → watch for position teleport glitch on re-entry
- [ ] **BUG-05** — Kill Redis temporarily → verify maritime poller reconnects and resumes mission listening
- [ ] **BUG-06** — Open Payload Inspector on a maritime vessel → confirm IMO, destination, and dimensions are populated
- [ ] **BUG-08** — Watch for ship icons appearing at airport locations (C1/C2/C3 ground vehicles)
- [ ] **BUG-09** — Watch orbital propagation cycle elapsed time in logs (should be <5s for ~1000 sats)
- [ ] **BUG-10** — Open browser console → watch for rapid WebSocket connect/disconnect cycling

---

*Generated: 2026-02-24. Branch: `claude/tactical-map-bug-report-aTIep`.*
