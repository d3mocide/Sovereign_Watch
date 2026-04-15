# GDELT Conflict Filter + ReliefWeb Integration

## Issue

ACLED was the planned geopolitical conflict data source but requires institutional API access.
Two complementary alternatives were identified:

1. **GDELT** is already integrated but publishes all CAMEO event types including cooperative
   and neutral events, diluting conflict-signal fidelity.
2. **ReliefWeb** (UN OCHA) provides structured, geolocated humanitarian/conflict crisis data
   via a free REST API requiring no key or institution affiliation.

The requirement was to incorporate both improvements into the existing `sovereign-gdelt-pulse`
service rather than adding a new container.

## Solution

Refactored `GDELTPulseService` to run two concurrent polling loops via `asyncio.gather`:

- **GDELT loop** — unchanged cadence (15 min), now filters to conflict-only CAMEO events by default.
- **ReliefWeb loop** — new, runs every 30 min, fetches current/alert disasters from the
  ReliefWeb API and normalises them into the same `gdelt_raw` Kafka message schema.

Both sources feed the same downstream pipeline (Historian → `gdelt_events` → API → frontend)
with no schema or infrastructure changes required.

## Changes

### `backend/ingestion/gdelt_pulse/service.py`
- Added `GDELT_CONFLICT_ONLY` env var (default `true`): filters GDELT events to
  QuadClass 3 (VerbalConflict) and QuadClass 4 (MaterialConflict) only.
- Added `RELIEFWEB_POLL_INTERVAL` env var (default 1800 s).
- Added `CONFLICT_QUAD_CLASSES` constant and `_RELIEFWEB_TYPE_GOLDSTEIN` mapping.
- Renamed `poll_loop` to delegate to `_gdelt_loop` + `_reliefweb_loop` via `asyncio.gather`.
- Added `fetch_reliefweb()`: POSTs to ReliefWeb `/v1/disasters`, emits one `gdelt_raw`
  message per (disaster × country) with stable `event_id = rw-{id}-{iso3}` for dedup.
- ReliefWeb uses the disaster's creation timestamp as `time` so the historian's
  `ON CONFLICT (event_id, time) DO NOTHING` gives idempotent repeated polls.
- Mapped disaster type names to approximate Goldstein scale values for UI colour coding.

### `backend/ingestion/gdelt_pulse/tests/test_gdelt.py`
- Refactored GET mock into `_make_get_mock` helper; added `_make_post_mock` for ReliefWeb.
- Added 5 GDELT conflict-filter tests (QuadClass 1/2 blocked, QuadClass 3 passes,
  filter disabled passes all, blank QuadClass blocked).
- Added 7 ReliefWeb tests (single country, multi-country, no location, no countries,
  HTTP error, unknown type fallback, empty data list).
- Total: 20 tests, all passing.

### `docker-compose.yml`
- Added `GDELT_CONFLICT_ONLY` and `RELIEFWEB_POLL_INTERVAL` to `sovereign-gdelt-pulse`
  environment block with shell-variable defaults.

### `.env.example`
- Added `GDELT_CONFLICT_ONLY` and `RELIEFWEB_POLL_INTERVAL` under a new
  `--- GDELT + ReliefWeb Pulse ---` section.

## Verification

```
cd backend/ingestion/gdelt_pulse
uv tool run ruff check .   # All checks passed
uv run python -m pytest    # 20 passed in 1.82s
```

## Benefits

- **Higher conflict fidelity**: GDELT volume is reduced to ~30–40 % of raw events
  (conflict quad classes only), so the map and AI context are conflict-focused.
- **ReliefWeb coverage**: Active humanitarian crises and declared disasters now appear
  on the map within 30 minutes of UN OCHA updating them — no API key required.
- **No new container**: Both sources run inside the existing `sovereign-gdelt-pulse`
  service, keeping the compose file compact.
- **Idempotent deduplication**: ReliefWeb events use creation-time timestamps so
  repeated polls of ongoing crises never create duplicate rows.
- **Configurable**: `GDELT_CONFLICT_ONLY=false` restores the original all-events
  behaviour for operators who want full coverage.
