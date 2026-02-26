# Task: Security Hardening for Tracks Replay API

## Issue
The `/api/tracks/replay` endpoint was vulnerable to Denial of Service (DoS) attacks because it did not enforce limits on the requested time range or the number of returned records. A malicious user could request an extremely large time range (e.g., 10 years), causing the database to fetch millions of rows and potentially crash the service. Additionally, the endpoint (and others) leaked internal exception details (including database errors) in HTTP 500 responses, posing an Information Disclosure risk.

## Solution
Implemented strict input validation and resource limits for the replay endpoint. Updated error handling to return generic error messages to clients while logging detailed errors internally.

## Changes
1.  **Configuration**: Added `TRACK_REPLAY_MAX_LIMIT` (default 10000) and `TRACK_REPLAY_MAX_HOURS` (default 168 hours / 7 days) to `backend/api/core/config.py`.
2.  **Validation**: Modified `replay_tracks` in `backend/api/routers/tracks.py` to:
    -   Validate that the requested time range does not exceed `TRACK_REPLAY_MAX_HOURS` *before* attempting database connection.
    -   Return HTTP 400 Bad Request if the range is too large.
3.  **Query Limiting**: Updated the SQL query to include a `LIMIT` clause using `TRACK_REPLAY_MAX_LIMIT`.
4.  **Error Handling**: Wrapped database operations in `try/except` blocks that catch exceptions, log them, and raise HTTP 500 with a generic "Internal server error" message. This was applied to `replay_tracks`, `get_track_history`, and `search_tracks`.

## Verification
-   **New Test**: Created `backend/api/tests/test_tracks_replay.py`.
    -   `test_replay_tracks_huge_range_blocked`: Verifies that a request for a 1-year range returns HTTP 400.
    -   `test_replay_tracks_valid_range`: Verifies that a valid 1-hour range request proceeds (returns 503 if DB is unavailable, proving validation passed).
-   **Regression Testing**: Ran the full backend test suite (`python -m pytest backend/api/tests/`), confirming all tests pass.

## Benefits
-   **DoS Protection**: Prevents resource exhaustion by limiting the scope of replay queries.
-   **Security**: Prevents leakage of internal database schema or error details to potential attackers.
