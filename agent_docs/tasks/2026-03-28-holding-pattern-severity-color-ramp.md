# 2026-03-28 - Holding Pattern Severity Color Ramp

## Issue
Holding-pattern map markers used a single amber style regardless of maneuver intensity, making it hard to quickly distinguish moderate holds from extended multi-turn activity.

## Solution
Implemented a turn-based severity color ramp in the holding-pattern map layer so visual priority increases with completed turns.

## Changes
- Updated `frontend/src/layers/buildHoldingPatternLayer.ts`:
  - Added turn-based severity buckets using `turns_completed` from hold feature properties.
  - Color ramp:
    - `< 2 turns` -> amber
    - `2 to < 5 turns` -> orange
    - `>= 5 turns` -> red
  - Scaled line/fill alpha with severity plus pulse to improve readability under dense overlays.
  - Updated Deck.gl `updateTriggers` for color recalculation with animation updates.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Faster analyst triage of higher-intensity holding behavior.
- Clear red visual indicator for 5+ turn sustained patterns.
- Better map legibility when multiple hold tracks overlap.
