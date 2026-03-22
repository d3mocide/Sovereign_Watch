# 2026-03-22-move-gdelt-to-intel-feed

## Issue

The GDELT "OSINT Pulse" layer toggle was located under the global map layers filter. The user feels this is not the best location and wants it moved to a footer widget in the Intelligence Stream (Intel Feed) to better integrate with the intelligence gathering workflow.

## Solution

1. Removed the GDELT OSINT toggle from `SystemStatus.tsx`.
2. Implemented a new "OSINT Pulse (GDELT)" footer widget at the bottom of `IntelFeed.tsx`.
3. Added a detailed legend and status indicators to the new footer widget to provide more context than a simple toggle.

## Changes

- `frontend/src/components/widgets/SystemStatus.tsx`: Deleted the OSINT Events Filter block.
- `frontend/src/components/widgets/IntelFeed.tsx`:
  - Added `Newspaper` import from `lucide-react`.
  - Updated `IntelFeedProps` for better TypeScript compatibility with `onFilterChange`.
  - Added the GDELT OSINT Footer Widget with a sentiment distribution legend and toggle.

## Verification

- Run `pnpm run lint` and `pnpm run test` in the `frontend` directory.
- Verify visually that the GDELT toggle now appears at the bottom of the Intelligence Stream.

## Benefits

Improves the accessibility of real-time OSINT data by co-locating the toggle with the primary intelligence feed, while providing immediate visual feedback on the nature of the data (sentiment distribution).
