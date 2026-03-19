# 2026-03-15-refine-system-health-toggle-ui

## Issue
The System Health toggle button in the `TopBar` was using a rectangular padding (`px-2 py-0.5`), making it look inconsistent with the square toggles (like History Trails) even though it only contained an icon.

## Solution
Update the button styling to match the square icon-only toggle pattern used elsewhere in the UI.

## Changes
- Modified `frontend/src/components/layouts/TopBar.tsx`:
    - Changed `px-2 py-0.5` to `p-1` on the System Health button.
    - Simplified classes to match the square toggle aesthetic.

## Verification
- Visual inspection: The button is now square and aligned with the other map toggles.
