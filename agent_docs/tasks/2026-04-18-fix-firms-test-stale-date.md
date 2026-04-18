# Fix: FIRMS Test Stale Hardcoded Date

## Issue

The CI PR run was failing with:

```
FAILED tests/test_firms_router.py::test_parse_firms_csv_to_rows_filters_and_normalizes_live_world_feed
assert 0 == 1
```

`_parse_firms_csv_to_rows` filters rows by comparing `acq_dt` against
`datetime.now(UTC) - timedelta(hours=hours_back)`.  The test fixture used a
hardcoded `acq_date` of `2026-04-14`, which was written within the 72-hour
window at the time of authoring but naturally expired as calendar time advanced
past `2026-04-17` (72 h later).  Every row was silently dropped by the cutoff
filter, returning an empty list and causing `assert len(rows) == 1` to fail.

## Solution

Replace the hardcoded `acq_date`/`acq_time` values in the CSV fixture with
values derived from `datetime.now(UTC) - timedelta(hours=1)`.  This keeps the
fixture data perpetually one hour old — always well inside any `hours_back`
window the test might use — without requiring any changes to the production
router code.

## Changes

| File | Change |
|------|--------|
| `backend/api/tests/test_firms_router.py` | Added `from datetime import UTC, datetime, timedelta` import; replaced hardcoded `2026-04-14` date/time strings with dynamically computed values 1 hour before test execution. |

## Verification

```
cd backend/api && uv run python -m pytest tests/test_firms_router.py -v
```

All 5 tests in the file pass.  No router production code was changed.

## Benefits

- **Stability**: The test is now date-agnostic and will never fail due to the
  fixture going stale.
- **Correctness**: The fixture accurately models "recent" FIRMS data, which is
  the scenario the test was always intended to cover.
