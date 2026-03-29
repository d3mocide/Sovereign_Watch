# 2026-03-28 - News Widget Full-View Design Alignment

## Issue
The full-size News widget feed was functional but visually generic relative to the Intel/OSINT panel design language. It lacked the tactical metadata hierarchy used elsewhere in the interface.

## Solution
Restyle the full-size RSS feed section to match Intel design philosophy: compact terminal-like metadata, stronger visual hierarchy, and explicit aggregate stream context.

## Changes
- Updated `frontend/src/components/widgets/NewsWidget.tsx`:
  - Added `formatZuluTime` helper for compact UTC time chips.
  - Added `formatAge` helper for relative age labels (minutes/hours/days).
  - Replaced the simple card list in full view with:
    - Aggregate strip header (`Aggregate Feed`, `SORT: NEWEST`, item count badge).
    - Row-level metadata line with source badge + age + Zulu time.
    - Monospace row index marker for scan-friendly sequencing.
    - Tactical border/background/hover states aligned to Intel side panels.
- Preserved existing behavior:
  - Time-only ordering (newest first).
  - Single-column layout.
  - Live Threats default-collapsed state.

## Verification
- Ran targeted frontend verification:
  - `cd frontend && pnpm run lint`
  - `cd frontend && pnpm run test`
- Result: pass (`2` test files, `36` tests, `0` failures).

## Benefits
- Better visual consistency with the broader Intel HUD style system.
- Faster operator scanability using metadata-first rows and ranked sequence indicators.
- Clearer aggregate-feed framing for cross-domain story monitoring.
