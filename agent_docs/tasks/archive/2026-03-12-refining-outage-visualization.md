# 2026-03-12-refining-outage-visualization

## Issue
Internet outages were being mislabeled as "Landing Stations" in the right sidebar. Additionally, outages were only rendered as point markers, making it difficult to visualize the scale of national-level outages. The project also lacked a dedicated TAK protocol message for internet outages.

## Solution
1. **Sidebar Fix**: Updated `SidebarRight.tsx` to correctly identify `entity_type: "outage"` and display the appropriate header.
2. **Country Shading**: Integrated a lightweight world GeoJSON (Natural Earth 110m) and implemented a `GeoJsonLayer` in `buildInfraLayers.ts` to shade entire countries based on reported outage severity.
3. **TAK Protocol Extension**: Added the `InternetOutage` message type to `tak.proto` and integrated it into the `Detail` message to support future TAK-native outage streaming.
4. **Data Enrichment**: Updated `infra_poller` to include ISO Alpha-2 country codes in the GeoJSON output to enable matching with the world map layer.

## Changes
- **Frontend**:
    - [MODIFY] [SidebarRight.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/layouts/SidebarRight.tsx): Fixed header labeling and added IODA_API source indicator.
    - [MODIFY] [buildInfraLayers.ts](file:///d:/Projects/SovereignWatch/frontend/src/layers/buildInfraLayers.ts): Added `worldCountriesData` parameter and implemented severity-based country shading.
    - [MODIFY] [TacticalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/TacticalMap.tsx): Added logic to fetch `world-countries.json` and pass it down.
    - [MODIFY] [useAnimationLoop.ts](file:///d:/Projects/SovereignWatch/frontend/src/hooks/useAnimationLoop.ts): Integrated `worldCountriesData` into the animation loop dependencies.
    - [NEW] `frontend/public/world-countries.json`: Lightweight world country boundaries.
- **Backend**:
    - [MODIFY] [tak.proto](file:///d:/Projects/SovereignWatch/backend/api/proto/tak.proto): Defined `InternetOutage` message.
    - [MODIFY] [main.py](file:///d:/Projects/SovereignWatch/backend/ingestion/infra_poller/main.py): Included `country_code` in outage properties.

## Verification
- **Sidebar**: Verified that selecting an outage point now displays "INTERNET OUTAGE" and cites "IODA_API".
- **Map Shading**: Confirmed that countries with high-severity outages are shaded (Red/Orange/Yellow) while specific regional outages maintain their point markers.
- **Protocol**: `tak.proto` successfully extended; `infra-poller` container rebuilt and running.

## Benefits
- Improved situational awareness for large-scale internet connectivity issues.
- Compliance with the project's TAK Protocol V1 architectural invariant.
- More professional and accurate UI representation.
