# Sovereign Watch — Code Audit & Bug Fix Report
**Date:** 2026-03-01
**Auditor:** Claude (AI Code Review)
**Scope:** Full codebase (excluding `.agents/` folder)
**Branch:** `claude/code-audit-report-NpyAL`

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5     |
| Medium   | 7     |
| Low      | 8     |
| **Total**| **20**|

---

## Critical Bugs

---

### BUG-001 — Double Rate Limiter Acquisition in Aviation Poller
**File:** `backend/ingestion/aviation_poller/service.py:158-159`
**Severity:** Critical
**Impact:** Polling rate halved; potential deadlock under high contention

**Description:**
`source_loop()` acquires `source.limiter` before calling `self.poller._fetch()`, but `_fetch()` also acquires `source.limiter` internally. With `AsyncLimiter(1, period)`, each logical poll consumes two tokens from the same bucket, effectively halving the configured rate limit. Under high load, the inner acquisition may stall for an entire `rate_limit_period`, causing cascading delays.

```python
# service.py:156-159 — OUTER limiter acquired
async with source.limiter:
    data = await self.poller._fetch(source, url)  # INNER limiter acquired again inside _fetch()
```

```python
# multi_source_poller.py:161-162 — INNER limiter acquired
async with source.limiter:
    async with self.session.get(...) as resp:
```

**Fix:** Remove the `async with source.limiter:` wrapper in `source_loop()`. The rate limiting is already handled inside `_fetch()`.

---

### BUG-002 — Historian Batch Lost on Shutdown
**File:** `backend/api/services/historian.py:81-106`
**Severity:** Critical
**Impact:** Data loss — up to `BATCH_SIZE` (100) track records silently dropped on shutdown

**Description:**
When the historian task is cancelled (e.g., on app shutdown), the `asyncio.CancelledError` interrupts the `async for msg in consumer` loop. Any records accumulated in `batch` that haven't yet been flushed are silently discarded. The `finally` block only stops the Kafka consumer; it never flushes the remaining batch.

```python
# historian.py — finally block never flushes remaining batch
finally:
    await consumer.stop()   # <-- remaining batch is lost here
    logger.info("Historian consumer stopped")
```

**Fix:** Add a flush of the remaining batch inside the `finally` block before `consumer.stop()`.

---

### BUG-003 — Invalid Signal Handler Uses `asyncio.create_task()` Outside Running Loop
**File:** `backend/ingestion/aviation_poller/main.py:12`
**Severity:** Critical
**Impact:** Graceful shutdown silently fails; service doesn't cleanly exit on SIGTERM/SIGINT

**Description:**
In the aviation poller, signal handlers are registered before the event loop is started. The lambda inside `add_signal_handler` calls `asyncio.create_task()`, which requires a running event loop from within a coroutine context. When the signal fires, the lambda may raise `RuntimeError: no running event loop`. The correct pattern is `loop.create_task()`.

```python
# main.py:12 — wrong: asyncio.create_task() may not see the running loop from a signal handler
loop.add_signal_handler(sig, lambda: asyncio.create_task(service.shutdown()))
```

The same pattern also exists in `backend/ingestion/maritime_poller/main.py:11`.

**Fix:** Replace `asyncio.create_task(...)` with `loop.create_task(...)` in both signal handlers.

---

### BUG-004 — Analysis Endpoint Crashes on NULL `avg_speed` / `avg_alt`
**File:** `backend/api/routers/analysis.py:79-80`
**Severity:** Critical
**Impact:** 500 Internal Server Error when a track has no speed/altitude data recorded

**Description:**
The analysis endpoint formats `track_summary['avg_speed']` and `track_summary['avg_alt']` using `:.1f` / `:.0f` f-string formatters. PostgreSQL `AVG()` returns `NULL` when all values in the aggregated column are `NULL`. If an entity's tracks have no speed or altitude data, these values will be Python `None`, and the f-string formatter will raise `TypeError: unsupported format character 'f' for None`.

The `points == 0` guard only catches the no-rows case; it does not protect against all-NULL column values.

```python
# analysis.py:79-80 — crashes when avg_speed or avg_alt is None
f"    - Avg Speed: {track_summary['avg_speed']:.1f} m/s"
f"    - Avg Alt: {track_summary['avg_alt']:.0f} m"
```

**Fix:** Replace with null-safe formatting: `{track_summary['avg_speed'] or 0:.1f}`.

---

### BUG-005 — Synchronous `completion()` Call Blocks the Async Event Loop
**File:** `backend/api/routers/analysis.py:91-98`
**Severity:** Critical
**Impact:** Every AI analysis request freezes the entire API server until the LLM responds

**Description:**
The `event_generator()` async generator calls LiteLLM's synchronous `completion()` function directly without wrapping it in `asyncio.to_thread()` or similar. This blocking call can take several seconds, during which the entire FastAPI event loop is stalled — no WebSocket messages can be broadcast, no other HTTP requests can be served, and health checks will time out.

```python
# analysis.py:91 — synchronous LLM call inside async generator blocks the event loop
async def event_generator():
    response = completion(          # <-- BLOCKING sync call
        model=settings.LITELLM_MODEL,
        ...
    )
```

**Fix:** Wrap the synchronous `completion()` call in `await asyncio.to_thread(completion, ...)` or use LiteLLM's async `acompletion()` equivalent.

---

## Medium Bugs

---

### BUG-006 — Replay Endpoint Accepts Reversed Time Windows
**File:** `backend/api/routers/tracks.py:135-140`
**Severity:** Medium
**Impact:** Negative `duration_hours` bypasses the max-hours check; query returns 0 rows silently

**Description:**
The replay endpoint validates that the time window doesn't exceed `TRACK_REPLAY_MAX_HOURS`, but it never validates that `dt_start < dt_end`. When `dt_end` precedes `dt_start`, `duration_hours` is negative, which always satisfies `duration_hours > settings.TRACK_REPLAY_MAX_HOURS` as `False`, so the request passes. The DB query will then return 0 rows without error.

```python
duration_hours = (dt_end - dt_start).total_seconds() / 3600  # can be negative
if duration_hours > settings.TRACK_REPLAY_MAX_HOURS:          # negative always passes
    raise HTTPException(...)
```

**Fix:** Add `if dt_end <= dt_start: raise HTTPException(status_code=400, detail="end must be after start")`.

---

### BUG-007 — No Positive Validation for `limit` and `hours` Query Parameters
**File:** `backend/api/routers/tracks.py:36-49`
**Severity:** Medium
**Impact:** Negative or zero values passed to the database; query may behave unexpectedly

**Description:**
The `/api/tracks/history/{entity_id}` endpoint checks `limit > MAX_LIMIT` and `hours > MAX_HOURS` but never checks for `limit <= 0` or `hours <= 0`. Passing `limit=0` returns no rows. Passing `limit=-1` or `hours=-1` may cause unexpected DB behavior or an asyncpg error.

**Fix:** Add lower-bound checks: `if limit <= 0 or hours <= 0: raise HTTPException(status_code=400, detail="limit and hours must be positive")`.

---

### BUG-008 — CORS Wildcard Origin with `allow_credentials=True` (JS8Call Server)
**File:** `js8call/server.py:465-471`
**Severity:** Medium
**Impact:** Security misconfiguration; browsers block credentialed cross-origin requests; auth cookies won't work

**Description:**
The JS8Call bridge sets `allow_origins=["*"]` and `allow_credentials=True` simultaneously. Per the CORS specification (and enforced by all modern browsers), when `Access-Control-Allow-Credentials: true`, the `Access-Control-Allow-Origin` header must be an explicit origin, not the wildcard `*`. Browsers will reject such responses with a CORS error. This also represents a security risk if credentials are ever used.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],         # INVALID with allow_credentials=True
    allow_credentials=True,
    ...
)
```

**Fix:** Either remove `allow_credentials=True`, or replace `allow_origins=["*"]` with an explicit allowlist from an environment variable (mirroring the main API pattern).

---

### BUG-009 — Historian Silently Discards Batch When DB Pool Is Not Ready
**File:** `backend/api/services/historian.py:86-94`
**Severity:** Medium
**Impact:** Track data silently lost if DB pool hasn't initialized by the first flush window

**Description:**
When the flush condition is met (`batch >= BATCH_SIZE` or `FLUSH_INTERVAL` elapsed), the code checks `if db.pool:` and only writes if the pool is available. If the pool is not yet ready (e.g., startup race condition), the entire batch is discarded and `batch = []` is reset, permanently losing the data with no warning log.

```python
if db.pool:
    try:
        await conn.executemany(insert_sql, batch)
    except Exception as db_err:
        logger.error(f"Historian DB Error: {db_err}")

batch = []     # <-- always cleared, even when DB was unavailable
last_flush = now
```

**Fix:** Only reset `batch` and `last_flush` after a successful write. If `db.pool` is not ready, log a warning and skip the reset so records are retried on the next flush cycle (with a cap to prevent unbounded growth).

---

### BUG-010 — Potential Division by Zero in ECEF-to-LLA at Polar Positions
**File:** `backend/ingestion/orbital_pulse/utils.py:40`
**Severity:** Medium
**Impact:** Runtime `ZeroDivisionError` / `inf` value emitted for satellites passing over poles

**Description:**
The iterative ECEF-to-geodetic conversion divides by `np.cos(lat)`. At geographic latitude ±90°, `cos(lat) = 0`, causing division by zero (returns `inf` in NumPy, but corrupts the altitude value). While rare, polar orbit satellites (inclination > 80°) like weather and GPS satellites do pass through or near the poles.

```python
alt = p / np.cos(lat) - N   # Division by zero when lat = ±π/2
```

**Fix:** Clamp `lat` away from exactly ±π/2 using `np.clip(lat, -np.pi/2 + 1e-9, np.pi/2 - 1e-9)` before the division, or use the standard Bowring iterative method which handles poles correctly.

---

### BUG-011 — `asyncio.get_event_loop()` Deprecated; Should Use `get_running_loop()`
**File:** `js8call/server.py:618, 647`
**Severity:** Medium
**Impact:** DeprecationWarning in Python 3.10+; will raise `RuntimeError` in a future Python version

**Description:**
Inside async WebSocket handlers, the code calls `asyncio.get_event_loop()` to run blocking functions in an executor. This is deprecated since Python 3.10. Inside a running coroutine, `asyncio.get_running_loop()` is the correct API.

```python
# server.py:618 — deprecated
await asyncio.get_event_loop().run_in_executor(None, lambda: _start_kiwi_pipeline(...))
# server.py:647
await asyncio.get_event_loop().run_in_executor(None, _stop_kiwi_pipeline)
```

**Fix:** Replace both with `await asyncio.get_running_loop().run_in_executor(...)`.

---

### BUG-012 — Historian Does Not Flush Remaining Batch When DB Write Fails
**File:** `backend/api/services/historian.py:91-94`
**Severity:** Medium
**Impact:** DB errors during `executemany` are logged but the failed batch is silently dropped

**Description:**
When `conn.executemany(insert_sql, batch)` raises a database exception, the error is logged but `batch = []` and `last_flush = now` are still executed unconditionally (they're outside the try/except). This means data from a failed write is discarded instead of retried.

```python
try:
    await conn.executemany(insert_sql, batch)
except Exception as db_err:
    logger.error(f"Historian DB Error: {db_err}")

batch = []         # <-- executes even after a failed write
last_flush = now
```

**Fix:** Move `batch = []` and `last_flush = now` inside the `try` block after the successful `executemany` call.

---

## Low Severity / Code Quality

---

### BUG-013 — Debug `console.log` Statements Left in Production Code
**Files:**
- `frontend/src/components/map/TacticalMap.tsx:318`
- `frontend/src/hooks/useEntityWorker.ts:501, 509`
- `frontend/src/components/map/TacticalMap.tsx:494`

**Description:**
Multiple `console.log()` calls are present in production rendering paths. These create noisy browser console output and slightly degrade performance in high-frequency update loops.

```typescript
// TacticalMap.tsx:318
console.log("FollowMode prop changed:", followMode);
// useEntityWorker.ts:501
console.log(`Connecting to Feed: ${wsUrl} (attempt ${reconnectAttempts + 1})`);
```

**Fix:** Remove or replace with a conditional debug logger controlled by a `VITE_DEBUG` env flag.

---

### BUG-014 — Redundant Inner `if action == "SEND"` Guard
**File:** `js8call/server.py:557`
**Severity:** Low
**Impact:** Dead code — confusing to read and introduces a subtle variable shadowing issue

**Description:**
Inside the `if action == "SEND":` branch, there is an inner `if action == "SEND" and cmd.get("target") and cmd.get("message"):` check that is always true at that point. This creates two variables for the same value: outer `text = cmd.get("message", "")` and inner `message = cmd["message"]`. The `_enqueue_from_thread` echo uses `text` while the TX message uses `message`, which are the same value but through different variable names.

**Fix:** Remove the redundant inner `if` check and use a single variable name for the message content.

---

### BUG-015 — Misleading Variable Names `currentDr` / `previousDr`
**File:** `frontend/src/hooks/useEntityWorker.ts:256-263`
**Severity:** Low
**Impact:** Code readability / maintainability

**Description:**
`currentDr` and `previousDr` are both assigned from `drStateRef.current.get(entity.uid)` before the state is overwritten, making them identical references. The variable naming implies they differ, causing confusion. The comment explains the intent but the implementation looks like a copy-paste artifact.

```typescript
const currentDr = drStateRef.current.get(entity.uid);   // same lookup
// ...
const previousDr = drStateRef.current.get(entity.uid);  // identical lookup
```

**Fix:** Remove `currentDr` and rename `previousDr` to `existingDr` or similar to make the intent clear. Only one lookup is needed.

---

### BUG-016 — `_message_queue` Type Annotation Mismatch
**File:** `js8call/server.py:87`
**Severity:** Low
**Impact:** Type checker warnings; misleading to readers

**Description:**
The global `_message_queue` is annotated as `asyncio.Queue` but initialized to `None`. The annotation should reflect its nullable initial state.

```python
_message_queue: asyncio.Queue = None  # Should be Optional[asyncio.Queue]
```

**Fix:** `_message_queue: Optional[asyncio.Queue] = None`

---

### BUG-017 — Deprecated `@app.on_event()` Lifecycle Hooks
**File:** `backend/api/main.py:53, 66`
**Severity:** Low
**Impact:** Will break when FastAPI removes the deprecated decorator (future version)

**Description:**
FastAPI deprecated `@app.on_event("startup")` and `@app.on_event("shutdown")` in favor of the `lifespan` context manager pattern (already used correctly in `js8call/server.py`). While functional today, these will be removed in a future FastAPI release.

**Fix:** Migrate to a `@asynccontextmanager` lifespan function, similar to the pattern used in `js8call/server.py`.

---

### BUG-018 — Unused `hex` Debug Variable Computed Every Decode
**File:** `frontend/src/workers/tak.worker.ts:65-68`
**Severity:** Low
**Impact:** Wasted CPU — hex string is computed for every decoded TAK message in production

**Description:**
Every decoded TAK protobuf message computes a hex string representation of the raw bytes and attaches it as `object.raw`. This is debug/inspection data that runs in the hot decode path on every incoming message (potentially thousands per minute).

```typescript
const hex = Array.from(cleanBuffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
// ...
(object as any).raw = hex;
```

**Fix:** Gate behind a `DEBUG` flag, or remove entirely if no UI feature currently displays raw hex.

---

### BUG-019 — Magic Number `511` for AIS True Heading Not Commented at Use Site
**File:** `backend/ingestion/maritime_poller/service.py:234, 266`
**Severity:** Low
**Impact:** Code clarity

**Description:**
`511` is the AIS "not available" sentinel value for true heading, per ITU-R M.1371. It appears as a magic number in two places without a constant definition.

```python
"heading": msg.get("TrueHeading", 511)   # AIS "not available" value
```

**Fix:** Define `AIS_HEADING_NOT_AVAILABLE = 511` at the top of the file and reference it by name.

---

### BUG-020 — `calculate_bbox` Doesn't Clamp Coordinates at Poles
**File:** `backend/ingestion/maritime_poller/utils.py:14-18`
**Severity:** Low
**Impact:** AISStream subscription with invalid coordinates (lat > 90 or < -90)

**Description:**
`calculate_bbox` computes `min_lat = center_lat - lat_offset` and `max_lat = center_lat + lat_offset` without clamping to the valid range `[-90, 90]`. For a coverage area centered near the poles (or with a large radius), this produces out-of-range latitudes that AISStream may reject or silently ignore.

```python
min_lat = center_lat - lat_offset   # can be < -90
max_lat = center_lat + lat_offset   # can be > 90
```

**Fix:** Clamp with `min_lat = max(-90.0, center_lat - lat_offset)` and `max_lat = min(90.0, center_lat + lat_offset)`.

---

## Files Reviewed

| File | Lines | Status |
|------|-------|--------|
| `backend/api/main.py` | 89 | Reviewed |
| `backend/api/core/config.py` | 27 | Reviewed |
| `backend/api/core/database.py` | 28 | Reviewed |
| `backend/api/models/schemas.py` | 13 | Reviewed |
| `backend/api/routers/system.py` | 75 | Reviewed |
| `backend/api/routers/tracks.py` | 159 | Reviewed |
| `backend/api/routers/analysis.py` | 104 | Reviewed |
| `backend/api/routers/repeaters.py` | 103 | Reviewed |
| `backend/api/services/historian.py` | 107 | Reviewed |
| `backend/api/services/broadcast.py` | 151 | Reviewed |
| `backend/api/services/tak.py` | 105 | Reviewed |
| `backend/api/tests/test_tak_utils.py` | 190 | Reviewed |
| `backend/api/tests/test_cors.py` | 46 | Reviewed |
| `backend/api/tests/test_tracks_replay.py` | 73 | Reviewed |
| `backend/ingestion/aviation_poller/main.py` | 25 | Reviewed |
| `backend/ingestion/aviation_poller/service.py` | 333 | Reviewed |
| `backend/ingestion/aviation_poller/arbitration.py` | 57 | Reviewed |
| `backend/ingestion/aviation_poller/classification.py` | 93 | Reviewed |
| `backend/ingestion/aviation_poller/multi_source_poller.py` | 205 | Reviewed |
| `backend/ingestion/aviation_poller/utils.py` | 37 | Reviewed |
| `backend/ingestion/aviation_poller/h3_sharding.py` | 99 | Reviewed |
| `backend/ingestion/maritime_poller/main.py` | 31 | Reviewed |
| `backend/ingestion/maritime_poller/service.py` | 438 | Reviewed |
| `backend/ingestion/maritime_poller/utils.py` | 21 | Reviewed |
| `backend/ingestion/orbital_pulse/service.py` | 312 | Reviewed |
| `backend/ingestion/orbital_pulse/utils.py` | 53 | Reviewed |
| `js8call/server.py` | 766 | Reviewed |
| `frontend/src/types.ts` | 142 | Reviewed |
| `frontend/src/workers/tak.worker.ts` | 99 | Reviewed |
| `frontend/src/hooks/useEntityWorker.ts` | 571 | Reviewed |
| `frontend/src/components/map/TacticalMap.tsx` | 759 | Reviewed |
| `frontend/src/utils/map/geoUtils.ts` | 167 | Reviewed |
| `frontend/src/utils/replayUtils.ts` | 47 | Reviewed |

---

## Recommended Fix Priority

| Priority | Bug ID | Description |
|----------|--------|-------------|
| P0 — Fix Now | BUG-005 | Sync LLM call blocks event loop |
| P0 — Fix Now | BUG-001 | Double rate limiter acquisition |
| P0 — Fix Now | BUG-002 | Historian batch lost on shutdown |
| P1 — This Sprint | BUG-003 | Signal handler misuse |
| P1 — This Sprint | BUG-004 | Analysis endpoint crash on NULL avg |
| P1 — This Sprint | BUG-009 | Historian silently drops data on DB unavailable |
| P1 — This Sprint | BUG-012 | Historian drops batch on write failure |
| P2 — Next Sprint | BUG-006 | Reversed replay time window bypass |
| P2 — Next Sprint | BUG-007 | Missing positive validation on limit/hours |
| P2 — Next Sprint | BUG-008 | CORS wildcard + credentials |
| P2 — Next Sprint | BUG-010 | Division by zero at poles |
| P2 — Next Sprint | BUG-011 | Deprecated event loop API |
| P3 — Backlog | BUG-013 to BUG-020 | Code quality / low severity |
