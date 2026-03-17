# 2026-03-16-fix-osint-news-sticky-header.md

## Issue
The OSINT News header scrolls away when scrolling through the news items. The user wants the header to remain fixed at the top, similar to the EMCOMM Sites widget.

## Solution
Modified the `DashboardView.tsx` layout for the OSINT News section. 
1. Reverted the parent container to `overflow-hidden`.
2. Removed the unnecessary wrapper div around `NewsWidget`.
3. Since `NewsWidget` (in compact mode) already provides a `flex-1 overflow-y-auto` container, making it a direct flex child of the widget column ensures the header stays fixed (`flex-shrink-0`) while the news content scrolls.

## Changes
- `frontend/src/components/views/DashboardView.tsx`: Updated OSINT News section structure.

## Verification
- Visual inspection (HMR).
- Verified `NewsWidget.tsx` compact mode returns a scrollable container.
- Ran `npm run lint` to ensure no regressions.

## Benefits
- Improved UI consistency.
- Correct situational awareness display where headers remain visible during interaction.
