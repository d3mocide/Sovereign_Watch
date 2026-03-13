# 2026-03-12-fix-map-layers-chevron-clickability.md

## Issue
The chevron icon in the "MAP LAYERS" header (bottom-left sidebar) was visually present but not clickable for expanding or collapsing the panel. The panel only toggled when clicking the text "MAP LAYERS".

## Solution
The issue was caused by a `div` containing the quick toggle buttons and the main chevron overlapping the background toggle button. By default, this `div` captured all click events. The fix involved:
1. Adding `pointer-events-none` to the container `div` so that clicks on the chevron (which also has `pointer-events-none`) pass through to the main toggle button underneath.
2. Adding `pointer-events-auto` back to the inner container of the quick toggle buttons to ensure they remain interactive.

## Changes

### Frontend
- [SystemStatus.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/widgets/SystemStatus.tsx): Added `pointer-events-none` to the relative container of header controls and `pointer-events-auto` to the quick toggles sub-container.

## Verification
- **Browser verification**:
    - Confirmed clicking the chevron icon now toggles the panel.
    - Confirmed clicking the "MAP LAYERS" text still works.
    - Confirmed quick toggle buttons (Amateur Radio, Submarine Cables) still work as expected.

## Benefits
- Improved UI accessibility and intuitive interaction by making the visual toggle cue (the chevron) functional.
