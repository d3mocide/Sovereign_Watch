# 2026-03-28 - News Widget Single-Column + Default Threat Collapse

## Issue
The full-size Intel view news widget rendered feed cards in multiple columns, which reduced readability for long headlines. The Live Threats panel also opened expanded by default, consuming vertical space on load.

## Solution
Adjust the full-size widget layout to a single-column feed list and initialize the Live Threats section in a collapsed state.

## Changes
- Updated `frontend/src/components/widgets/NewsWidget.tsx`:
  - Set `showThreats` default state from `true` to `false` so Live Threats is minimized on initial render.
  - Changed full-size RSS feed grid classes from `grid-cols-2 xl:grid-cols-3` to `grid-cols-1`.

## Verification
- Ran frontend verification (targeted):
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Improves scanability of news headlines in Intel view full-size mode.
- Reduces default visual noise and preserves vertical space by collapsing Live Threats initially.
- Keeps behavior easy to discover with existing expand/collapse control.
