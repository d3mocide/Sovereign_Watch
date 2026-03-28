# NDBC Buoy Sidebar Styling

**Date**: 2024-12-19  
**Status**: Complete

## Issue

NDBC buoy entities displayed in the sidebar needed semantic distinction from submarine cable infrastructure and internet outages.

## Solution

Updated [InfraView.tsx](../../frontend/src/components/layouts/sidebar-right/InfraView.tsx) to render buoys with dedicated icon, label, and category title:

1. Added `Wave` icon import from lucide-react
2. Updated header icon logic:
   - Buoys: Wave icon with blue accent color
   - Outages: Signal icon (unchanged)
   - Infrastructure: Network icon (unchanged)
3. Updated category label:
   - Buoys: "OCEAN_BUOY" (previously "UNDERSEA_INFRASTRUCTURE")
   - Outages: "CRITICAL_EVENT" (unchanged)
   - Infrastructure: "UNDERSEA_INFRASTRUCTURE" (unchanged)
4. Updated entity type descriptors:
   - Buoys: "OCEANOGRAPHIC_BUOY"
   - Outages: "INTERNET_OUTAGE"
   - Stations: "LANDING_STATION"
   - Cables: "SUBMARINE_CABLE"
5. Updated location field label (applies to all infra types for consistency, with explicit `isBuoy` case)

## Changes

- **File**: [frontend/src/components/layouts/sidebar-right/InfraView.tsx](../../frontend/src/components/layouts/sidebar-right/InfraView.tsx)
  - Line 1: Added `Wave` icon to imports
  - Lines 61-72: Updated header icon/label conditionals (added `isBuoy` case)
  - Lines 78-85: Updated entity type descriptor (added `isBuoy` case)
  - Lines 91-99: Updated location field label (added `isBuoy` case for consistency)

## Verification

- ✅ Frontend linting passes (no syntax errors)
- ✅ Type detection works: `isBuoy = props.buoy_id !== undefined`
- ✅ Wave icon renders with blue accent color matching buoy theme
- ✅ Category labels properly distinguish buoys from infrastructure and outages

## Benefits

- Users can now visually distinguish buoys from submarine cables and outages in the sidebar
- Semantic naming ("OCEAN_BUOY", "OCEANOGRAPHIC_BUOY") improves UX clarity
- Wave icon provides intuitive visual metaphor for ocean observation
- Consistent color coding (blue for buoys vs. cyan for infrastructure vs. red/amber for outages)
