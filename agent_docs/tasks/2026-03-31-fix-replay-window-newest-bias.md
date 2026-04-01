# 2026-03-31 - Fix Replay Window Newest-Bias

## Issue
Replay appeared to show only the most recent segment (often around the last 10-20 minutes) even when users requested longer windows and historical data existed.

## Root Cause
`/api/tracks/replay` used a global `ORDER BY time DESC LIMIT ...` after bucketing. In dense traffic periods, newest buckets consumed most of the row budget, crowding out older parts of the requested time range.

## Solution
Changed replay row selection to distribute rows across all time buckets in the requested window rather than globally favoring newest rows.

## Changes
- Updated `backend/api/routers/tracks.py` in `replay_tracks()`:
  - Added CTE pipeline:
    - `bucketed`: one latest point per `(entity_id, bucket_time)`.
    - `bucket_counts`: total distinct time buckets.
    - `per_bucket_limited`: ranks rows per time bucket and computes per-bucket cap from global limit.
  - Selection now keeps up to `ceil(limit / total_buckets)` rows per bucket.
  - Final result still sorted by time descending for frontend compatibility.

## Verification
- Backend API lint + tests (targeted):
  - `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
- Results:
  - `tests/test_tracks_replay.py`: pass
  - Most backend tests: pass
  - One unrelated pre-existing failure observed in `tests/test_tracks_validation.py::test_track_history_hours_exceeded` due to expected max-hours mismatch.
  - One unrelated pre-existing lint warning in `services/escalation_detector.py` (`context_score` unused).

## Benefits
- Replay now better represents the full requested interval under high ingest density.
- Prevents newest-data crowd-out when row budget is constrained.
- Improves operator trust in historical playback controls.
