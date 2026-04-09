# Marine Poller Multi-Source Failover

## Issue

The maritime AIS poller relied exclusively on AISStream.io as its single data source.
Any AISStream.io outage, rate-limit event, or connectivity problem caused complete loss
of marine situational awareness with no automatic recovery path.

## Solution

Added **AISHub** (a free, globally-aggregated volunteer AIS network) as an optional
fallback WebSocket source with **active-passive automatic failover**.

The primary source (AISStream.io) runs as before. After 3 consecutive failed connection
attempts the poller switches to AISHub and continues streaming. Every 5 minutes while on
the fallback the poller probes the primary to restore it as soon as it recovers.

Setting the new `AISHUB_USERNAME` env var enables the fallback. When absent, behaviour
is fully backward-compatible (AISStream-only, no code path changes).

## Changes

### New files

| File | Purpose |
|------|---------|
| `backend/ingestion/maritime_poller/sources/__init__.py` | Python package marker |
| `backend/ingestion/maritime_poller/sources/base.py` | `AISSourceConfig` dataclass — per-source health tracking (`is_healthy`, `penalize`, `reset_cooldown`) mirroring the aviation poller pattern |
| `backend/ingestion/maritime_poller/sources/aishub.py` | AISHub WebSocket connector + message normaliser; converts AISHub JSON arrays into AISStream-compatible dicts so all existing TAK transform/publish logic is reused unchanged |
| `backend/ingestion/maritime_poller/tests/test_source_health.py` | 10 unit tests for `AISSourceConfig` (healthy state, exponential backoff, caps, reset) |
| `backend/ingestion/maritime_poller/tests/test_aishub_normalizer.py` | 22 unit tests for `parse_messages` + `build_ws_url` (coordinates, SOG, static data, edge cases) |

### Modified files

**`service.py`**
- Added `AISHUB_USERNAME` env var and multi-source constants (`SOURCE_SWITCH_AFTER_ATTEMPTS=3`, `PRIMARY_PROBE_INTERVAL_SECONDS=300`)
- Added `_sources: List[AISSourceConfig]` and `_active_source_idx` state to `__init__`
- Added source helper methods: `_active_source()`, `_select_next_source()`, `_should_probe_primary()`, `_restore_primary()`, `_connect_active_source()`
- `setup()` populates the source list; AISHub only added when `AISHUB_USERNAME` is set
- Extracted `_dispatch_ais_message()` helper shared by both source paths, removing the need for format-specific branching inside `stream_loop()`
- `stream_loop()` updated to use `_connect_active_source()`, trigger source switching after enough consecutive failures, probe primary on fallback timer, and decode AISHub frames via `aishub_source.parse_messages()`
- Redis key `maritime:active_source` written on every heartbeat for external visibility

**`tests/conftest.py`**
- Removed an incorrect `sources` package stub that would have blocked real imports

## Verification

```
cd backend/ingestion/maritime_poller
uv tool run ruff check .   # All checks passed
uv run python -m pytest    # 123 passed
```

## Benefits

- **Eliminates single point of failure** — AISStream.io downtime no longer causes total marine blindness
- **Zero operational change** when `AISHUB_USERNAME` is not set — full backward compatibility
- **Automatic recovery** — poller probes and restores primary every 5 min without a restart
- **Per-source health tracking** — exponential backoff (30 s → 300 s cap) on individual sources, same pattern as aviation poller
- **Active source visibility** — `maritime:active_source` Redis key allows health dashboards to show which source is live
- **Normalisation is transparent** — AISHub frames are converted to AISStream format before dispatch; TAK output format is identical regardless of source
