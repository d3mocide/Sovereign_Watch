# 2026-04-19 — Semantic Cache Retry Logic + Space Pulse Silent Except Logging

## Issue

1. **Semantic cache permanently disabled after startup failure** (`backend/api/services/semantic_cache.py`): If Redis was unavailable when the backend first called `get_semantic_cache()`, `_available` was set to `False` and never retried. Every subsequent call returned the same disabled singleton, meaning the semantic cache stayed off for the entire process lifetime even after Redis recovered.

2. **Silent except blocks in space_pulse sources**: Six `except Exception: pass` blocks in space_pulse ingestion pollers swallowed Redis error-state write failures silently, making it impossible to diagnose Redis connectivity issues from logs. These matched the same pattern fixed in `infra_poller`, `aviation_poller`, and `gdelt_pulse` in the prior session.

## Solution

### Semantic Cache Retry

- Added `import time` to `semantic_cache.py`
- Added `_RETRY_COOLDOWN_S = 60.0` class constant on `SovereignSemanticCache`
- Added `self._last_init_attempt: float = 0.0` to `__init__`
- Set `self._last_init_attempt = time.monotonic()` at entry of `initialise()` so each attempt is timestamped
- Updated `get_semantic_cache()`: when the singleton exists but `_available is False`, checks if `time.monotonic() - _last_init_attempt >= 60.0` and, if so, retries `initialise()`. Logs at INFO when a retry fires.
- Result: after Redis recovers, the next call that arrives more than 60s after the last failed attempt automatically re-enables the cache without any process restart.

### Space Pulse Silent Excepts

Applied `except Exception as re: logger.debug("Redis error-state write failed: %s", re)` to all 6 locations:

- `orbital.py:350`: Redis `poller:orbital:last_error` write
- `space_weather.py:177`: Redis `poller:space_weather:last_error` write
- `firms.py:383`: Redis `poller:firms:last_error` write
- `satnogs_network.py:82`: Redis `poller:satnogs_network:last_error` write
- `satnogs_db.py:67`: Redis `poller:satnogs_db:last_error` write
- `iss.py:62`: Redis `poller:infra_iss:last_error` write

## Changes

| File | Change |
|------|--------|
| `backend/api/services/semantic_cache.py` | `import time`; `_RETRY_COOLDOWN_S`; `_last_init_attempt` field; retry branch in `get_semantic_cache()` |
| `backend/ingestion/space_pulse/sources/orbital.py` | Silent except → debug log |
| `backend/ingestion/space_pulse/sources/space_weather.py` | Silent except → debug log |
| `backend/ingestion/space_pulse/sources/firms.py` | Silent except → debug log |
| `backend/ingestion/space_pulse/sources/satnogs_network.py` | Silent except → debug log |
| `backend/ingestion/space_pulse/sources/satnogs_db.py` | Silent except → debug log |
| `backend/ingestion/space_pulse/sources/iss.py` | Silent except → debug log |

## Verification

- `ruff check` passes on all 7 modified files with no errors

## Benefits

- Semantic cache self-heals after transient Redis outages; operators no longer need to restart the backend API to re-enable LLM response deduplication
- 60-second cooldown prevents tight retry loops against an unrecoverable Redis instance
- All space_pulse Redis error-state write failures now appear in debug logs, enabling health diagnostics when Redis is intermittently unavailable
