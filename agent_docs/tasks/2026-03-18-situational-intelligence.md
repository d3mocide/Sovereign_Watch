# Task: Elevating AI Analyst Situational Intelligence (v0.37.1)

## Issue

The in-app AI Analyst (accessible via `/api/analyze/{uid}`) was previously limited to basic telemetry statistics (averages). This "summary-only" approach masked critical behavioral patterns (loitering, course shifts) and lacked domain-specific context (infrastructure proximity, orbital sensor footprints).

## Solution

We successfully implemented **Intel Bumps 2, 3, and 4**:
- **Bump 2**: Enhanced the backend prompt construction to include a 10-point waypoint history for trajectory analysis.
- **Bump 3**: Unified the analysis router with spatial correlation for nearby RF sites (10km) and undersea cable landing stations (20km).
- **Bump 4**: Integrated the SGP4 propagator into the analysis loop to detect active "INTEL-category" satellite overpasses relative to a target's position.

## Changes

- **`backend/api/routers/analysis.py`**:
    - Rewrote the `/api/analyze/{uid}` endpoint for multi-domain fusion.
    - Implemented **Waypoints**, **RF Infrastructure**, **Submarine Cables**, and **Orbital Overpasses** in the AI Analyst prompt.
    - Added a SGP4-based fallback synthesis for satellites to provide analytical telemetry when no real-time telemetry exists in the DB.
    - Added rigorous JSON decoding for the `waypoint_history` data from Postgres to prevent `JSONDecodeError` during high-volume analysis requests.
- **`frontend/package.json`**: Bumped version to `0.37.1`.
- **`CHANGELOG.md`**: Recorded the situational intelligence release.
- **`RELEASE_NOTES.md`**: Updated with v0.37.1 highlights.

## Verification

1. **Syntax Check**: `python -m py_compile backend/api/routers/analysis.py` (PASSED).
2. **Docker Build**: `docker compose up backend-api --build -d` (PASSED).
3. **Behavioral Test**: Analysis of a known target UID now correctly displays waypoint data and infrastructure perspective.
4. **Bug Fix**: Confirmed that the `JSONDecodeError` on waypoint strings has been resolved through explicit decoding of the the `json_agg` result.

## Benefits

- **Contextual Awareness**: The AI Analyst now "understands" the target's environment, identifying potential threats to infrastructure.
- **Improved Intent Assessment**: Trajectory data allows the AI to distinguish between routine transit and suspicious behavior.
- **Multi-sensor Fusion**: Integrating orbital overpasses gives the Analyst a truly global perspective on sensor coverage.
- **Stability**: Resolved a critical crash bug in the cognitive analysis pipeline.
