# NDBC & Aurora Reorganization: Add Environmental Category

**Date**: 2026-03-28  
**Issue**: NDBC layer toggle was added but incorrectly placed under GLOBAL NETWORK (network infrastructure category). AURORA FORECAST was incorrect in HAZARDS (active threats). Both are observational/environmental data, not threats or network infrastructure.  
**Status**: ✅ COMPLETE

## Solution

**Reorganized map layer categories** for semantic correctness:

1. **Removed** OCEAN BUOYS from GLOBAL NETWORK
2. **Created** new ENVIRONMENTAL category (teal theme)
3. **Moved** AURORA FORECAST from HAZARDS → ENVIRONMENTAL
4. **Updated** HAZARDS to only contain active threats (GPS JAMMING, HOLDING PATTERNS)

## Changes

### `frontend/src/components/widgets/LayerVisibilityControls.tsx`

**State Management:**
- Added `environmentalExpanded` state hook for ENVIRONMENTAL section expansion
- Created `environmentalIsOn` computed state: `showAurora || showBuoys`
- Updated `infraIsOn` to exclude `showBuoys`
- Updated `hazardsIsOn` to exclude `showAurora` (now only `showJamming | showHoldingPatterns`)

**Toggle Functions:**
- Added `toggleEnvironmental()`: manages ENVIRONMENTAL category master toggle
- Updated `toggleInfra()`: removed buoys management
- Updated `toggleHazards()`: removed aurora management

**UI Layout:**
- Created new **ENVIRONMENTAL** section (teal/cyan color scheme, `Sparkles` icon)
  - Contains: AURORA FORECAST (purple), OCEAN BUOYS (blue)
- Removed OCEAN BUOYS from GLOBAL NETWORK section
- Removed AURORA FORECAST from HAZARDS expanded section
- Reordered sections: RF Infrastructure → Global Network → **Environmental (new)** → Hazards

**Save/Load Integration:**
- Used `handleSubFilterChange()` consistently for all toggles (auto-saves to localStorage)

## Category Structure (Updated)

```
MAP LAYERS
├── RF INFRASTRUCTURE (emerald)
│   ├── HAM / GMRS
│   ├── NOAA NWR
│   └── Public Safety
├── GLOBAL NETWORK (cyan)
│   ├── Undersea Cables
│   ├── Landing Stations
│   ├── Internet Outages
│   └── FCC Towers
├── ENVIRONMENTAL (teal) ← NEW
│   ├── Aurora Forecast
│   └── Ocean Buoys
└── HAZARDS (amber)
    ├── GPS Jamming Zones
    └── Holding Patterns
```

**Rationale:**
- **ENVIRONMENTAL**: Atmospheric/oceanographic observations (aurora, buoys, future: weather, VIIRS thermal)
- **HAZARDS**: Active threats/constraints (jamming attacks, aviation holds)
- **GLOBAL NETWORK**: Critical communications infrastructure
- **RF INFRASTRUCTURE**: Radio communications sites

## Verification

✅ ESLint passes (no syntax errors)  
✅ LayerVisibilityControls renders without errors  
✅ Toggle state logic correctly updates parent filter state  
✅ Filter preference system (localStorage) auto-saves all toggles  
✅ Master toggles (ENVIRONMENTAL, HAZARDS) correctly manage sub-layer visibility  

## User Experience

Users can now:

1. Click "MAP LAYERS" in the top-left HUD panel
2. Expand **ENVIRONMENTAL** section (teal button)
3. Toggle **AURORA FORECAST** (geomagnetic storm forecasts) on/off
4. Toggle **OCEAN BUOYS** (NDBC sea state observations) on/off
5. Master toggle enables/disables both environmental layers together
6. State persists across sessions (localStorage)

## Impact

- **Architecture**: Restored ENVIRONMENTAL category as first-class layer group alongside RF/Network/Hazards
- **Future-Ready**: New structure scales for environmental features (VIIRS thermal, weather radar)
- **Semantic Clarity**: Categories now reflect data domain, not just rendering priority
- **Performance**: No changes; same layer composition, only UI reorganization

## Migration Notes

- Users with saved preferences (localStorage) will retain individual toggle states
- Aurora toggle position change (Hazards → Environmental) is transparent to saved state
- No breaking changes to `MapFilters` interface or layer rendering logic
