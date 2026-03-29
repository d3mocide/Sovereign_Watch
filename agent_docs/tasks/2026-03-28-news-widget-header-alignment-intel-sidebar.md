# 2026-03-28 - News Widget Header Alignment with Intel Sidebar

## Issue
The full-view News widget header did not match the visual grammar used by Intel sidebar widgets (for example, Active Actors), creating inconsistency in typography, header chrome, and metadata treatment.

## Solution
Refactor the News widget header to use the same structural and typographic pattern as Intel sidebar headers while preserving existing refresh and timestamp behavior.

## Changes
- Updated frontend/src/components/widgets/NewsWidget.tsx:
  - Replaced header container styles with Intel-style header classes:
    - border-b border-white/10
    - bg-white/5
    - shrink-0 flex items-center justify-between px-3 py-2
  - Updated title typography to match Active Actors conventions:
    - text-[10px] font-bold tracking-[.3em] uppercase text-white/80
  - Added bracketed count indicator in header: `[items.length]` using amber tabular styling.
  - Kept right-side timestamp and refresh control, adjusted spacing/tone to match surrounding headers.

## Verification
- Ran targeted frontend verification:
  - cd frontend && pnpm run lint
  - cd frontend && pnpm run test
- Result: pass (2 test files, 36 tests, 0 failures).

## Benefits
- Consistent Intel HUD header language across widgets.
- Better visual cohesion between News and Active Actors panels.
- Maintains existing interactions while improving design-system alignment.
