# Bolt: Vectorize ECEF to LLA Conversion

## Issue

In `backend/api/routers/tracks.py` and `backend/api/routers/analysis.py`, scalar coordinate conversions from Earth-Centered, Earth-Fixed (ECEF) to Latitude-Longitude-Altitude (LLA) were executed in loops. Converting hundreds of coordinates one-by-one generated excessive array allocations and python function call overhead.

## Solution

Refactor `get_track_history` and `analyze_track` to convert arrays of coordinate coordinates using a vectorized conversion function, replacing loop-based conversions with a single batched C-optimized NumPy operation.

## Changes

- **`backend/api/routers/tracks.py`**
  - Updated `get_track_history` to extract and convert coordinates as a batch NumPy array.
- **`backend/api/routers/analysis.py`**
  - Updated `analyze_track` to batch ECEF coordinate conversions.

## Verification

Run on host (`backend/api`):
- `uv tool run ruff check .` -> All checks passed.
- `uv run python -m pytest tests/test_tracks_validation.py` -> All tests passed.

## Benefits

- Significant performance speedup in track history and analysis routing.
- Reduced GC pressure by eliminating hundreds of scalar array allocations per request.
