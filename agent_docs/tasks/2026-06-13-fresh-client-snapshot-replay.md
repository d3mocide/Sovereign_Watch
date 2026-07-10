# Fresh-Client Snapshot Replay (Last-Value Cache)

## Issue

After the recent frontend rendering optimizations (cached static layers, lazy
map loading), the map paints almost instantly — but on a **fresh client** it
stays empty for a long time while entities trickle in. Aircraft, ships, and
satellites only arrive over the live WebSocket (`/api/tracks/live`), and the
broadcast consumer reads Kafka with `auto_offset_reset="latest"`. A late joiner
therefore receives **no backlog** — it must wait for each poller to re-emit its
next full sweep before the world populates. The orbital sweep alone is a
~15–37 s cycle (≈11k satellites), so a fresh client can sit on a near-empty map
for tens of seconds. The faster (now near-instant) render made this pre-existing
gap glaringly obvious.

## Solution

Add a **last-value cache (LVC)** to `BroadcastManager` and replay it to every
newly-connected client before live streaming begins.

- As the Kafka consume loop transforms each message to its TAK frame, it also
  stores the latest frame per `uid` in an in-memory cache, keyed by entity id
  and stamped with a monotonic receive time. The cache is kept warm even when
  no clients are connected, so it is ready the instant someone joins.
- On WebSocket connect, the per-client worker first replays the current cache
  (the "snapshot") directly to that client, then enters the normal live-stream
  drain loop. Frames are sent on the existing one-frame-per-entity wire format,
  so **the frontend needs no changes** — a snapshot frame is indistinguishable
  from a live update, and the client's existing `lastSourceTime` de-dup guard
  harmlessly ignores any overlap between snapshot and live deltas.
- Stale entries (not re-emitted within `LIVE_SNAPSHOT_TTL_SECONDS`, default
  300 s) are excluded from snapshots and periodically pruned; a hard cap
  (`LIVE_SNAPSHOT_MAX_ENTITIES`, default 20 000) bounds memory.

### Why direct send, not the live queue

The per-client live queue is bounded at 256 messages (it intentionally drops
oldest under back-pressure). A multi-thousand-entity snapshot pushed through it
would be almost entirely dropped, so the snapshot is sent directly via
`send_bytes` with the same 3 s per-frame timeout, yielding to the event loop
every 256 frames so a large replay never starves the consume loop or other
clients.

## Changes

- **`backend/api/core/config.py`**
  - Added `LIVE_SNAPSHOT_TTL_SECONDS` (default 300) and
    `LIVE_SNAPSHOT_MAX_ENTITIES` (default 20 000).
- **`backend/api/services/broadcast.py`**
  - Added `import time` and the `_LVC_PRUNE_INTERVAL_S` constant.
  - `BroadcastManager.__init__`: added the `_lvc` cache and `_last_prune`.
  - `_consume`: records every transformed frame into the LVC
    (`_record_live`) before the early-out on zero clients.
  - New helpers: `_record_live`, `_maybe_prune` (TTL sweep + hard cap),
    `_snapshot_frames` (fresh frames, copied for safe concurrent iteration),
    and `_send_snapshot` (direct, yielding, disconnect-aware replay).
  - `_client_worker`: replays the snapshot before the live drain loop; bails
    out cleanly if the client disconnects mid-snapshot.
  - `stop()`: clears the cache.
- **`backend/api/tests/test_broadcast_snapshot.py`** (new)
  - Covers LVC population/overwrite, blank-uid rejection, TTL exclusion, prune
    (stale drop + hard cap), and snapshot send (all frames, empty no-op,
    mid-stream disconnect, stale exclusion).

## Verification

Run on host (`backend/api`):

- `uv tool run ruff check services/broadcast.py core/config.py tests/test_broadcast_snapshot.py` → All checks passed.
- `uv run python -m pytest tests/test_broadcast_snapshot.py tests/test_tracks_validation.py -q` → 16 passed.
- `uv run python -m pytest -q` (full API suite) → 167 passed.

No frontend changes were required, so frontend suites were not run (per the
Targeted Verification rule).

## Benefits

- **Fresh clients paint the full picture immediately** instead of waiting up to
  a full poller sweep (tens of seconds for satellites). The data-load latency a
  late joiner perceives drops from "next sweep" to "one connect round-trip."
- **Backend-only, wire-compatible**: no frontend changes, no proto/worker
  changes, no new service or DB query on connect — the snapshot is served from
  memory.
- **Bounded and self-healing**: TTL + hard cap bound memory; stale entities
  (landed aircraft, departed vessels) age out automatically and never appear in
  a snapshot.
- **Back-pressure safe**: the snapshot bypasses the bounded live queue and
  yields regularly, so a large replay cannot starve the consume loop or slow
  other connected clients.
