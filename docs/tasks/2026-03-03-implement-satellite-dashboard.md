# 2026-03-03 - Implement Satellite Dashboard Research

Implemented the multi-phase Orbital Dashboard feature requested in `SATELLITE-DASHBOARD-RESEARCH.md`.

## Work Completed

### Phase 1: Foundation
- Added the `ORBITAL` view mode pill to `TopBar.tsx`.
- Extended the `viewMode` state in `App.tsx` and routed it to a new `OrbitalDashboard` shell component.
- Implemented `OrbitalCategoryPills.tsx` for filtering satellites by type (GPS, COMMS, WEATHER, etc.).
- Extended Tailwind CSS config with orbital-specific purple tokens.

### Phase 2: Map Enhancements
- Added a `TerminatorLayer` to render the day/night shadow boundary using `suncalc`.
- Refactored `OrbitalLayer` to support ground track rendering (`showGroundTracks`) and uniform global footprint circle toggles (`showFootprints`).
- Plumbed these layer toggles into the `OrbitalDashboard` overlay controls.

### Phase 3: Pass Prediction & Telemetry
- Added `skyfield` and `sgp4` dependencies to the FastAPI backend.
- Created `/api/orbital/passes` route in `routers/orbital.py` to calculate upcoming satellite passes over a user-defined coordinate point.
- Created frontend `SatelliteInspector` to parse and format telemetry metadata.
- Created a pure SVG `PolarPlotWidget` to render azimuth/elevation path lines for passes.
- Created `PassPredictorWidget` list UI.

### Phase 4: RF Integration
- Developed the `DopplerWidget`, computing non-relativistic Doppler shifts from slant range rate over time, displaying an auto-scaling SVG line chart with a configurable base frequency input.

### Phase 5: Enhanced Ingestion
- Expanded Celestrak groups in `backend/ingestion/orbital_pulse/service.py` to ingest 20 distinct categories, covering stations, radarsats, spire, etc.
- Added `eccentricity`, `tle_line1`, and `tle_line2` to the Kafka output payload so that the tracking backend has direct access to the raw TLEs required for the pass prediction API.

All tasks were linted, tested, and passed self-review. Remaining issues on caching mentioned in the research document have been documented for future iterations.