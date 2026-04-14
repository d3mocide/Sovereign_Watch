## Issue
The SatNOGS stations proxy retried upstream requests after a fixed 60-second backoff even when SatNOGS explicitly throttled requests for a much longer window (for example, `Expected available in 2079 seconds`). This caused repeated upstream hammering and continued operator-visible failures.

## Solution
Updated the SatNOGS router to honor upstream throttle windows by parsing `Retry-After` headers and SatNOGS throttle response details, then persisting that exact backoff window in Redis.

## Changes
- Updated `backend/api/routers/satnogs.py`
  - Added helpers to parse and sanitize throttle durations.
  - Added structured backoff payload storage with `retry_after_s` and `backoff_until`.
  - Changed 429 handling to use the upstream retry duration instead of the fixed 60-second fallback.
  - Returned `503` with a retry hint for active upstream throttling.
  - Preserved short fallback backoff for non-429 transport and HTTP errors.
- Added `backend/api/tests/test_satnogs_router.py`
  - Covered `Retry-After` parsing.
  - Covered SatNOGS throttle-detail parsing.
  - Covered backoff bounds and payload round-trip behavior.

## Verification
- Ran: `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
- Result:
  - Ruff: passed
  - Pytest: passed (`140` tests)

## Benefits
- Stops retrying SatNOGS before the provider’s throttle window has expired.
- Reduces avoidable upstream pressure and repeated user-facing failures.
- Produces more accurate `retry in Ns` diagnostics for operators.
