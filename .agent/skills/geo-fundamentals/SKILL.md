# Geo Fundamentals - Sovereign Watch

> **CRITICAL:** Sovereign Watch performs significant geospatial processing on both the frontend (Deck.gl) and backend (PostGIS).

## Core Rules

1.  **Shared Utilities**: Shared geometric utility functions, including `chaikinSmooth`, `getDistanceMeters`, `getBearing`, and `maidenheadToLatLon`, are centralized in `frontend/src/utils/map/geoUtils.ts`.
2.  **Coordinates**: Standardize on standard EPSG:4326 (WGS84) Longitude/Latitude order for GeoJSON and database interactions, unless specifically working with libraries that require Lat/Lon.
3.  **Testing Mapping Functions**: Testing `getCompensatedCenter` in `frontend/src/utils/map/geoUtils.ts` requires mocking the map object with `getPitch()` and `getBearing()` methods.
4.  **Backend Spatial Filtering**: Always leverage PostGIS capabilities (e.g., `ST_DWithin`) over application-side distance filtering when querying the database to ensure performance.