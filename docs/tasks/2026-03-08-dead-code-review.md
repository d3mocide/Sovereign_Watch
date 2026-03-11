# Dead Code Review — 2026-03-08

Comprehensive scan across the entire Sovereign Watch monorepo.
All three layers analyzed: **Frontend (TypeScript/React)**, **Backend API (Python/FastAPI)**, and **Ingestion Pollers + JS8Call (Python)**.

---

## Severity Legend

| Severity | Meaning |
|----------|---------|
| CRITICAL | Entire unused module / significant dead code block |
| HIGH | Unused variable with retained computation overhead |
| MEDIUM | Duplicate constants; consolidation needed |
| LOW | Unused imports, unused interfaces |

---

## 1. Ingestion Pollers

### 1.1 `h3_sharding.py` — ENTIRE FILE UNUSED (CRITICAL)

**File:** `backend/ingestion/aviation_poller/h3_sharding.py`

The entire module is dead. `H3PriorityManager` was designed for adaptive H3 grid-based polling prioritization but was never imported or instantiated anywhere in the aviation poller.

Dead contents:
- `class H3PriorityManager` (lines 13–100)
- Methods: `__init__`, `start`, `initialize_region`, `get_next_batch`, `update_priority`, `get_cell_center_radius`
- All `h3` library calls (lines 48, 52, 96) are unreachable

**Recommendation:** Delete the file, or if H3 sharding is on the roadmap, move it to `docs/` as a design artifact.

---

### 1.2 `multi_source_poller.py` — Unused Import (LOW)

**File:** `backend/ingestion/aviation_poller/multi_source_poller.py` — line 4

```python
import json  # imported but never used
```

**Recommendation:** Remove the import.

---

### 1.3 `arbitration.py` — Unused Import (LOW)

**File:** `backend/ingestion/aviation_poller/arbitration.py` — line 2

```python
from typing import Optional  # imported but never referenced in type hints
```

**Recommendation:** Remove `Optional` from the import.

---

### 1.4 `maritime_poller/classification.py` — Unused Import (LOW)

**File:** `backend/ingestion/maritime_poller/classification.py` — line 1

```python
from typing import Any, Dict  # `Any` is unused; only Dict is used
```

**Recommendation:** Remove `Any` from the import.

---

### 1.5 `js8call/server.py` — Unused Import (LOW)

**File:** `js8call/server.py` — line 39

```python
import shlex  # imported but never called; only referenced in a comment
```

All `subprocess` calls use list format (`shell=False`), so `shlex.quote()` is never needed.

**Recommendation:** Remove the import.

---

## 2. Backend API

### 2.1 `routers/orbital.py` — Two Unused Imports (LOW)

**File:** `backend/api/routers/orbital.py`

| Line | Dead Import | Reason |
|------|------------|--------|
| 16 | `jday` from `sgp4.api` | Only `_jday_from_datetime()` helper is called (lines 161, 354); raw import is never used |
| 20 | `teme_to_ecef_vectorized` from `utils.sgp4_utils` | Left over from refactoring; only `teme_to_ecef` (non-vectorized) is called |

**Recommendation:** Remove both unused imports.

---

### 2.2 Test Mock Variables — Unused Assignments (LOW)

**Files:**
- `backend/api/tests/test_cors.py` — lines 16–18
- `backend/api/tests/test_tracks_validation.py` — lines 16–18
- `backend/api/tests/test_tracks_replay.py` — lines 17–19

Pattern in all three files:

```python
mock_pool = patch("...")
mock_redis = patch("...")
mock_kafka = patch("...")
```

The patches are applied correctly but the bound variable names are never used inside the test functions (no assertions reference them). Python convention for intentionally discarded values is `_`.

**Recommendation:** Either rename to `_mock_pool`, `_mock_redis`, `_mock_kafka` to signal intentional discard, or restructure as `with patch(...):` context managers without variable binding.

---

## 3. Frontend (TypeScript / React)

### 3.1 `useAnimationLoop.ts` — Retained Unused Variable (HIGH)

**File:** `frontend/src/hooks/useAnimationLoop.ts` — line 414

```typescript
void speedKts; // unused after speed-based smoothing removed — keep for future
```

The comment acknowledges this is dead. The variable `speedKts` is computed (line ~399) but immediately voided. This retains the computation overhead every animation frame while providing no value.

**Recommendation:** Remove the `speedKts` computation and the `void speedKts` statement. If speed-based smoothing is planned, note it in the roadmap instead.

---

### 3.2 `SHIP_TYPE_MAP` — Duplicate Constant (MEDIUM)

The same `SHIP_TYPE_MAP` constant is independently defined in two separate files:

- `frontend/src/components/widgets/SearchWidget.tsx`
- `frontend/src/components/layouts/SidebarRight.tsx`

Each file uses its own local copy. This is a DRY violation — if ship type labels need updating, both copies must be changed in sync.

**Recommendation:** Extract to `frontend/src/constants/shipTypes.ts` and import from both components.

---

### 3.3 `TerminatorLayer.tsx` — Unused Exported Interface (LOW)

**File:** `frontend/src/components/map/TerminatorLayer.tsx` — lines 85–87

```typescript
export interface TerminatorLayerProps {
  visible: boolean;
}
```

This interface is exported but never imported anywhere. The function `getTerminatorLayer()` already accepts a raw `boolean` parameter directly.

**Recommendation:** Remove the interface.

---

## Summary Table

| # | File | Item | Type | Severity |
|---|------|------|------|----------|
| 1 | `backend/ingestion/aviation_poller/h3_sharding.py` | Entire file — `H3PriorityManager` class | Unused module | CRITICAL |
| 2 | `frontend/src/hooks/useAnimationLoop.ts:414` | `void speedKts` + computation | Unused variable (per-frame cost) | HIGH |
| 3 | `frontend/src/components/widgets/SearchWidget.tsx` | `SHIP_TYPE_MAP` | Duplicate constant | MEDIUM |
| 4 | `frontend/src/components/layouts/SidebarRight.tsx` | `SHIP_TYPE_MAP` | Duplicate constant | MEDIUM |
| 5 | `backend/api/routers/orbital.py:16` | `jday` from `sgp4.api` | Unused import | LOW |
| 6 | `backend/api/routers/orbital.py:20` | `teme_to_ecef_vectorized` | Unused import | LOW |
| 7 | `backend/api/tests/test_cors.py:16-18` | `mock_pool`, `mock_redis`, `mock_kafka` | Unused assigned variables | LOW |
| 8 | `backend/api/tests/test_tracks_validation.py:16-18` | `mock_pool`, `mock_redis`, `mock_kafka` | Unused assigned variables | LOW |
| 9 | `backend/api/tests/test_tracks_replay.py:17-19` | `mock_pool`, `mock_redis`, `mock_kafka` | Unused assigned variables | LOW |
| 10 | `backend/ingestion/aviation_poller/multi_source_poller.py:4` | `import json` | Unused import | LOW |
| 11 | `backend/ingestion/aviation_poller/arbitration.py:2` | `Optional` from typing | Unused import | LOW |
| 12 | `backend/ingestion/maritime_poller/classification.py:1` | `Any` from typing | Unused import | LOW |
| 13 | `js8call/server.py:39` | `import shlex` | Unused import | LOW |
| 14 | `frontend/src/components/map/TerminatorLayer.tsx:85-87` | `TerminatorLayerProps` interface | Unused export | LOW |

**Total: 14 dead code items** — 1 CRITICAL, 1 HIGH, 2 MEDIUM, 10 LOW

---

## What Is NOT Dead Code (Notable Non-Findings)

- **`NOOP` in `App.tsx`** — Intentional; used as placeholder callback on 4 component props
- **Fallback data in `useInfraData.ts`** — Intentional; used in `catch` block when API fails
- **`kiwi_directory.py::KiwiNode.to_dict()`** — Public API surface, not dead
- **All Pydantic models in `backend/api/models/schemas.py`** — All three are actively consumed
- **All orbital constants** (`PASSES_CACHE_TTL`, `_VALID_MODEL_IDS`, etc.) — All referenced

---

## Recommended Action Order

1. **Delete** `backend/ingestion/aviation_poller/h3_sharding.py` (or archive to docs)
2. **Remove** `void speedKts` and its computation from `useAnimationLoop.ts`
3. **Extract** `SHIP_TYPE_MAP` to a shared constants file
4. **Strip** all unused imports across backend API, pollers, and JS8Call (11 items)
5. **Clean up** test mock variable assignments (prefix with `_` or restructure)
6. **Remove** `TerminatorLayerProps` interface
