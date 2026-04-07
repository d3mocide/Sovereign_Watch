# Clausal Chains Layer — Bug Investigation & Fixes

**Date:** 2026-04-06

## Issue

The Clausal Chains map layer was enabled in the UI (visible in the Analysis section of MAP LAYERS) but nothing rendered on the AOT, and the backend emitted a repeating error every 30 seconds:

```
ERROR:routers.ai_router:Error fetching clausal chains: dictionary update sequence element #0 has length 1; 2 is required
```

## Root Causes

Two independent bugs were stacked on top of each other.

### Bug 1 — Frontend: `useClausalChains` hook never fetched (missing `region`)

**File:** `frontend/src/components/map/TacticalMap.tsx`

The hook was called without a `region` parameter:

```ts
const { data: clausalChainsData } = useClausalChains({
  enabled: filters?.showClausalChains === true,
  lookback_hours: 24,
  // ← no region!
});
```

Inside `useClausalChains`, the fetch was gated on `!enabled || !region` — so it immediately bailed with an empty array every time. The `/api/ai_router/clausal-chains` endpoint requires `region` as a mandatory query param, so even if a request had fired, it would have failed.

### Bug 2 — Backend: `dict()` called on a raw JSON string

**File:** `backend/api/routers/ai_router.py` → `get_clausal_chains()`

```python
# Before (broken):
"adverbial_context": dict(row["adverbial_context"])
                     if row["adverbial_context"]
                     else {},
```

asyncpg can return JSONB columns as a raw JSON string rather than a pre-parsed dict (particularly when the clausalizer inserts via `json.dumps()` text). Calling `dict()` on a string iterates its *characters* (each length 1), producing the error "dictionary update sequence element #0 has length 1; 2 is required". The endpoint silently returned `[]` on every call due to the bare `except Exception` swallowing the error.

## Solution

### Frontend fix — move fetch inside `useAnimationLoop` (matching the cluster pattern)

Deleted the external `useClausalChains` call from `TacticalMap.tsx` entirely. Instead, added an internal `useEffect` fetch block inside `useAnimationLoop.ts` — identical in structure to the ST-DBSCAN cluster fetch:

- If a **mission AOT** is active: use `latLngToCell(mission.lat, mission.lon, 4)` (H3 resolution 4, same as clusters under exact AOT)
- Otherwise: fall back to **viewport centre** via `latLngToCell(center.lat, center.lng, 3)` (H3 resolution 3, ~large region)
- Refreshes every **30 seconds** with a `cancelled` guard to prevent stale state updates

The `clausalChainsData` prop was removed from `UseAnimationLoopOptions` and the destructure — the data is now owned internally.

### Backend fix — safe JSONB coercion helper

Added `_parse_adverbial_context(value)` helper to `ai_router.py`:

```python
def _parse_adverbial_context(value: object) -> Dict:
    if not value:
        return {}
    if isinstance(value, dict):   # asyncpg already parsed JSONB
        return value
    if isinstance(value, str):    # raw JSON string fallback
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    return dict(value)            # asyncpg Record / other mapping
```

The `get_clausal_chains` row-processing loop now calls `_parse_adverbial_context(row["adverbial_context"])` instead of `dict(...)`.

## Changes

| File | Change |
|---|---|
| `frontend/src/hooks/useAnimationLoop.ts` | Removed `clausalChainsData` from interface/destructure; added internal `useState` + `useEffect` fetch (mirrors cluster block) |
| `frontend/src/components/map/TacticalMap.tsx` | Removed `useClausalChains` import, hook call, and `clausalChainsData` prop pass |
| `backend/api/routers/ai_router.py` | Added `_parse_adverbial_context()` helper; replaced broken `dict(row["adverbial_context"])` call |

## Verification

- `pnpm run lint` — exit 0, no warnings
- `uv tool run ruff check routers/ai_router.py` — all checks passed
- Backend logs: error no longer fires on `/api/ai_router/clausal-chains` poll
- Layer will now receive data (once the clausalizer has processed enough state-change events to populate `clausal_chains` table)

## Notes on Data Availability

The clausal chains table is populated by `sovereign-tak-clausalizer`, which only writes a row when a tracked entity undergoes a **state change** (altitude shift, speed change, heading reversal, etc.) — not on every telemetry poll. Low-activity periods may yield sparse data even when the layer is correctly wired. The 90-day hypertable retention and 30s UI refresh interval are both appropriate.
