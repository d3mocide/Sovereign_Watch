# Code Review & Bug Audit

## Issue

Full codebase audit requested: identify dead code, broken functions, logic errors, and
resource leaks across backend API, frontend, ingestion pollers, and JS8Call service.

## Solution

Parallel audit agents inspected all major components. Confirmed bugs were fixed
immediately; the remaining findings are documented here as a reference backlog.

## Changes

### Fixed (this commit)

| File | Line(s) | Issue |
|------|---------|-------|
| `backend/api/routers/analysis.py` | 302–318 | `detect_rendezvous()` and `detect_emergency_transponders()` return `List[AnomalyMetric]`; code called `.description` directly on the list → `AttributeError` at runtime. Fixed by iterating and joining descriptions. |
| `backend/api/routers/analysis.py` | 336 | Silent `except Exception: pass` on intel-context DB lookup — changed to `logger.debug(...)`. |
| `backend/api/routers/stats.py` | 242 | Octant index into `OCT_LABELS` without bounds check → `IndexError` on bad DB data. Added `0 <= int(r["octant"]) < 8` guard. |
| `backend/api/core/auth.py` | 36 | `_bearer_scheme = HTTPBearer(...)` defined but never referenced — dead code removed. |
| `js8call/server.py` | 158–165 | `_udp_send()` created a socket but only closed it in the success path; exception left the socket open. Replaced with `with socket.socket(...) as tx:`. |
| `js8call/kiwi_client.py` | 234 | `self._password = password` stored but never read (password is passed directly to `_handshake()`). Unnecessary sensitive-data retention removed. |
| `frontend/src/App.tsx` | 286–291 | `res.json()` called before checking `res.ok` — HTTP error bodies silently parsed as valid GeoJSON. Added `if (!res.ok) throw` guard. |
| `frontend/src/api/auth.ts` | 170 | `!res.ok && res.status !== 204` — the `204` clause is unreachable (204 is 2xx, so `res.ok` is already `true`). Simplified to `!res.ok`. |

### Remaining findings (not fixed — require further assessment)

**Backend API**
- `analysis.py` multiple lines: `db.pool.fetchrow()` called without `async with db.pool.acquire()` — may exhaust pool under load.
- `broadcast.py` 178 vs 226: mixed tuple/bytes types in shared queue — fragile if type assumption breaks.
- `tracks.py` 154: `lat_arr[0]` without checking array length after `ecef_to_lla_vectorized()`.
- `semantic_cache.py`: Redis connection not retried on startup failure — cache stays disabled for process lifetime.

**Frontend**
- `App.tsx` 449, 794–795: multiple `as any` casts hiding type errors — should be typed properly.
- `useAppFilters.ts` 169: missing `updateMissionHash` in `useEffect` dep array.
- Various `.map()` calls in `DashboardView.tsx` missing `key` props.
- `tak.worker.ts` 56: `Uint8Array` accessed without length guard (returns `undefined` rather than throwing, but the magic-bytes check silently fails for short buffers).

**Ingestion pollers (24 silenced exception blocks)**  
All pollers contain `except Exception: pass` in Redis write paths (heartbeat, error state,
active-source). These should at minimum log at `DEBUG` level so health-check failures are
diagnosable. Priority files: `maritime_poller/service.py`, `aviation_poller/service.py`,
`gdelt_pulse/service.py`, `infra_poller/main.py`.

**Maritime poller**
- `service.py` 479–481: `TrueHeading == 0` treated as "not available" — should check `is None`.
- `service.py` 851–855: `cleanup_cache()` iterates and deletes in-place; `KeyError` on missing `last_seen` key crashes the task.
- `service.py` 818–821: `message_task.cancel()` not awaited — potential orphaned task.

**JS8Call**
- `server.py` 222–227: only `p2` (pacat) stored in `_kiwi_proc`; `p1` (kiwirecorder) can become orphaned if pacat exits.
- `server.py` 697–711: `datagram_received()` has bare `except: pass` — UDP parse errors completely invisible.
- `kiwi_directory.py` 282–300: `get_nodes()` reads `self._nodes` without the lock that `refresh()` holds on writes.
- `server.py` 1256–1267: `asyncio.ensure_future(ws.close(...))` without await — connections may not close before client set is cleared.

## Verification

- `uv tool run ruff check .` — pass for `backend/api`, `js8call`, `backend/ingestion/maritime_poller`
- Frontend lint unavailable (node_modules not installed in this environment)

## Benefits

- Eliminates `AttributeError` crash in the escalation-analysis path when multiple rendezvous or emergency-transponder anomalies are detected simultaneously.
- Resource leak in JS8Call UDP socket path closed.
- HTTP error responses no longer silently accepted as valid country GeoJSON.
- Removed unnecessary in-memory password storage in KiwiSDR client.
