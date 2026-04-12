# 2026-04-12-openaip-classification-fix.md — Airspace Enum Mapping

## Issue
Airspace zones were displaying numeric IDs (e.g., "TYPE: 2") and mapping to fallback "UNKNOWN" states. This caused the tactical map to default to grey/slate colors for active hazards and restricted areas, as the UI was looking for string labels like `DANGER` or `PROHIBITED`.

## Solution
Implemented a robust integer-to-string mapping layer in both the backend and frontend:
1.  **Backend Mapping**: Updated `OpenAIPSource.py` with full OpenAIP V2 schema dictionaries for `type` (0-36) and `icaoClass` (0-8).
2.  **Frontend Color Sync**: Expanded `TYPE_COLORS` to include newly identified types like CTR, TMA, and FIR.
3.  **UI Alignment**: Synchronized `MapTooltip.tsx` and `AirspaceView.tsx` with the new hazard and controlled airspace strings.

## Changes

### Backend
- **openaip_source.py**: Added `_AIRSPACE_TYPES` and `_ICAO_CLASSES`. Refactored `_parse_zone` to handle numeric inputs gracefully.

### Frontend
- **buildAirspaceLayer.ts**: Added color support for `CTR`, `TMA`, `CLASS`, `CONTROL`, `FIR`, `MILITARY`, `FIS`, and `VFR`.
- **AirspaceView.tsx**: Updated accent logic for the new hazard and administrative strings.
- **MapTooltip.tsx**: Unified coloring logic for airspace entities.

## Verification
- **Redis Query**: Confirmed that `airspace:zones` cache now contains `"type": "DANGER"` and `"icao_class": "CLASS_E"` instead of raw integers.
- **Poller Logs**: Confirmed the `sovereign-adsb-poller` successfully restarted and processed 250+ zones in the California/SeaTac region.

## Benefits
- **Tactical Clarity**: Operators can now immediately identify the nature of an airspace zone (Hazard vs. Controlled) via color and text labels.
- **Data Integrity**: ICAO classes are now correctly displayed as standard designations (e.g., CLASS B, CLASS E) rather than API-internal IDs.
