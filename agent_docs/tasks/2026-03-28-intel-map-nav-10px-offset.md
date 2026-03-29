# 2026-03-28 - Intel Map Nav 10px Vertical Offset

## Issue
In Intel map view, the bottom navigation controls (Globe/style/zoom cluster) sat too low relative to adjacent HUD elements.

## Solution
Add a configurable bottom offset to shared map controls and apply an Intel-specific 10px upward bump.

## Changes
- Updated `frontend/src/components/map/MapControls.tsx`:
  - Added optional `bottomOffsetClass?: string` prop.
  - Default remains `bottom-8` to preserve existing behavior in non-Intel views.
  - Applied class via interpolated wrapper class string.
- Updated `frontend/src/components/map/IntelGlobe.tsx`:
  - Passed `bottomOffsetClass="bottom-[42px]"` to move controls up by 10px from the default 32px baseline.

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Improves Intel map HUD spacing and readability.
- Keeps Tactical and Orbital maps unchanged.
- Provides reusable per-view positioning control for future tuning.
