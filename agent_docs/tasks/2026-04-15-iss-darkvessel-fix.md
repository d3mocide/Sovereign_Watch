# 2026-04-15-iss-darkvessel-fix

## Issue
- ISS ground track was fragmented and update frequency (15m) was too low for a smooth trail.
- Dark Vessel detection was unreliable due to land-masking failures (path mismatch) and lack of visual prominence for high-risk targets.

## Solution
- Reduced ISS polling interval to 5s and increased track buffer to 1080 points (1.5h).
- Implemented linear latitude interpolation at the antimeridian for seamless track connectivity.
- Fixed backend land-mask discovery logic to ensure `world-countries.json` is loaded from the correct `support/` directory.
- Added a heartbeat pulsing effect to "CRITICAL" severity dark vessels in the tactical layer.

## Changes
- `backend/ingestion/space_pulse/sources/iss.py`: Set `poll_interval_s = 5`.
- `backend/api/routers/firms.py`: Added `support/` to land-mask search paths; improved logging.
- `frontend/src/layers/buildISSLayer.ts`: Implemented `splitTrackAtAntimeridian` with interpolation.
- `frontend/src/layers/buildDarkVesselLayer.ts`: Added pulsing logic for critical vessels.
- `frontend/src/hooks/useISSTracker.ts`: Increased `DEFAULT_TRACK_LENGTH` to 1080.
- `backend/api/routers/iss.py`: Increased default track points to 1080.
- `frontend/src/layers/composition.ts`: Passed `now` to dark vessel layer.

## Verification
- Rebuild containers: `docker compose up -d --build sovereign-backend sovereign-space-pulse`.
- Observe logs: `docker compose logs -f sovereign-space-pulse` (verify 5s ISS polls).
- UI Check: Verify seamless ISS trail crossing 180/-180 and pulsing dark vessel rings.
