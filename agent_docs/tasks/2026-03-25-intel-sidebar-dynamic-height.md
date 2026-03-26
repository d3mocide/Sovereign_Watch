# 2026-03-25 - Intel Sidebar Dynamic Height

## Issue
The INTEL sidebar used a hard-coded height class (`h-195`), which did not adapt cleanly to different screen sizes.

## Solution
Replace the fixed height with dynamic sizing tied to available layout space and viewport bounds.

## Changes
- Updated `frontend/src/components/layouts/IntelSidebar.tsx`:
  - Changed root container classes from `h-195` to `h-[95%] max-h-[95dvh] min-h-0`.

## Verification
- Ran frontend lint:
  - `pnpm run lint` (pass)
- Ran frontend tests:
  - `pnpm run test` (blocked)
  - Failure reason: missing package `vite-plugin-cesium` while loading `vite.config.ts`.

## Benefits
- Sidebar height now scales with screen/layout changes.
- Keeps visual cap at approximately 95% of viewport height.
- Reduces brittle fixed-size behavior across resolutions.
