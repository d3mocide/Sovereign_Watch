# Dynamic RadioReference Ingestion & Expanded Limits

**Issue:** 
The platform was utilizing hardcoded state limiters for RadioReference (Oregon and Washington) and a strict 5000 row API limit for RF map pins. This caused artificial square and circular rendering cutoffs inside user-defined regions stretching beyond the Pacific Northwest or containing excessive data saturation.

**Solution:**
1. Increased the backend spatial query limit to gracefully handle rendering large RF infrastructure groupings.
2. Removed the obsolete "2000 NM" toggle constraint on the UI for RF sites payload.
3. Created a FIPS state geographical lookup dictionary within the RadioReference ingestion module. The module now performs an automated distance analysis against `CENTER_LAT`, `CENTER_LON`, and `RR_RADIUS_MI` across all 50 US states prior to API calls, generating bounding box equivalent coverage natively. 

**Changes:**
- `backend/api/routers/rf.py`: Bumped `LIMIT 5000` to `LIMIT 15000` inside the postGIS geospatial `get_rf_sites` pipeline.
- `frontend/src/components/widgets/SystemStatus.tsx`: Adjusted the `filters.rfRadius` buttons configuration mappings to explicitly cap presets at 1000NM max.
- `backend/ingestion/rf_pulse/sources/fips_states.py`: Developed a lightweight mapping object linking 50 standard US abbreviations to `fips` RadioReference state identifiers and lat/lon geographical centroids.
- `backend/ingestion/rf_pulse/sources/radioref.py`: Leveraged `fips_states.py` to intercept `AUTO` environment variable configurations, overriding the manual list fallback by geometrically isolating states residing inside the `RR_RADIUS_MI` envelope.
- `.env.example`: Updated the `RADIOREF_STATE_IDS` documentation and variable string to reflect the new dynamic `AUTO` behavior.

**Verification:**
- Rebuilt and restarted the `sovereign-rf-pulse` Docker container. Backend automatically utilized hot-reload (Uvicorn StatReloading) successfully.

**Benefits:**
The system is now completely user-agnostic regarding RadioReference extraction logic—allowing users to simply transplant their `.env` `CENTER_LAT/CENTER_LON` across the US without experiencing empty RF mapping zones or arbitrary geographical omissions.
