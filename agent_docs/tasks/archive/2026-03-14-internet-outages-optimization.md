# 2026-03-14 Internet Outages Layer Optimization

## Issue
The internet outages layer was slow to render and inconsistent, often requiring a view switch to trigger. Data fetching was redundant across map instances, and the layer was being recalculated every frame.

## Solution
1. **Centralized Data Fetching**: Moved `useInfraData` and `world-countries.json` fetching to `App.tsx` and passed data down as props.
2. **Incremental Loading**: Refactored `useInfraData` to remove `Promise.all`, allowing outages to render as soon as they arrive.
3. **Layer Memoization**: Implemented `useMemo` for the `countryOutageMap` in `useAnimationLoop.ts` to prevent per-frame recalculation.
4. **Prop Cleanup**: Fixed broken `useAnimationLoop` calls and removed duplicate prop definitions in map components.

## Changes
- [MODIFY] [App.tsx](file:///d:/Projects/SovereignWatch/frontend/src/App.tsx): Centralized infra data.
- [MODIFY] [TacticalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/TacticalMap.tsx) & [OrbitalMap.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/map/OrbitalMap.tsx): Consumed props, fixed animation loop.
- [MODIFY] [useInfraData.ts](file:///d:/Projects/SovereignWatch/frontend/src/hooks/useInfraData.ts): Individual fetch calls.
- [MODIFY] [useAnimationLoop.ts](file:///d:/Projects/SovereignWatch/frontend/src/hooks/useAnimationLoop.ts): Memoized outage map.
- [MODIFY] [buildInfraLayers.ts](file:///d:/Projects/SovereignWatch/frontend/src/layers/buildInfraLayers.ts): Integrated memoized map.

## Verification
- Verified that infrastructure data loads once and persists across view switches.
- Confirmed that "Internet Outages" layer renders promptly on load.
- Performance improved via memoization of country-outage mapping.

## Benefits
- Faster initial load for key tactical indicators.
- Reduced network traffic.
- Smoother map performance due to optimized layer construction.
