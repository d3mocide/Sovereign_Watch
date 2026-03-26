# 2026-03-25 - Add Intel Renderer Badge

## Issue
When testing Cesium disable behavior, it was hard to visually confirm whether the Intel globe was using Cesium or Deck.gl.

## Solution
Add an explicit renderer badge to the Intel sidebar header and bind it to the same runtime flag used by the INTEL globe render branch.

## Changes
- Updated frontend/src/components/layouts/IntelSidebar.tsx:
  - Added optional `renderer` prop with values `"DECKGL" | "CESIUM"`.
  - Added a styled badge in the header that displays the active renderer.
- Updated frontend/src/App.tsx:
  - Passed `renderer={USE_CESIUM_GLOBE ? "CESIUM" : "DECKGL"}` into `IntelSidebar`.

## Verification
- User skipped host lint/test execution for this step.
- Editor diagnostics check on modified files reported no errors.

## Benefits
- Provides immediate visual confirmation of active renderer during testing.
- Reduces ambiguity when toggling Cesium via environment variables.
