# Task Log: Vectorize Topocentric Pass Prediction Math

## Issue

In the `/api/orbital/pass-predictions` endpoint, satellite coordinate conversions (`ecef_to_topocentric`) were evaluated sequentially inside Python calculation loops over every minute of the satellite's pass window. For large satellite numbers or wide time windows, this iterative loop introduced noticeable latency hitches during satellite pass computation.

## Solution

Vectorized the coordinate transformations in `backend/api/utils/sgp4_utils.py` and `backend/api/routers/orbital.py`:

- Created `ecef_to_topocentric_vectorized()` in `sgp4_utils.py` to calculate azimuth, elevation, and range using vectorized NumPy array math across the entire prediction window in one pass.
- Updated `orbital.py` to construct Julian date (`jd_arr`) and fraction-of-day (`fr_arr`) arrays for batch SGP4 propagation via `satrec.sgp4_array()`, followed by `teme_to_ecef_vectorized()` and `ecef_to_topocentric_vectorized()`.

## Changes

- `backend/api/utils/sgp4_utils.py`: Added `ecef_to_topocentric_vectorized()`.
- `backend/api/routers/orbital.py`: Refactored pass prediction logic to use vectorized propagation and topocentric conversions.
- `.jules/bolt.md`: Documented performance optimization entry.

## Verification

- `cd backend/api && uv run python -m pytest tests/test_ai_router_orbital.py` passes cleanly.

## Benefits

- Eliminates iterative Python loop overhead for pass predictions.
- Accelerates orbital pass prediction calculation for large satellite passes.
