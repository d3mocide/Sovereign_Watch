# UI Telemetry and Stability Enhancements

**Date:** 2026-04-18

## Issue
- Active Conflict Zones widget and Intel Sidebar suffered from text wrapping at lower resolutions.
- StreamStatusMonitor only tracked legacy configuration state rather than true real-time operational health.
- FIRMS Layer build produced TypeScript errors (`TS6133`, `TS2531`) due to unused params and unprotected null objects.
- Redundant Alerts badge next to NWS alerts counting caused clutter in Dashboard view.
- Dashboard stream mappings missed proper backend identifiers, leaving several streams hidden.

## Solution
- Refactored `ActiveConflictWidget` and `IntelSidebar` header layouts to utilize dynamic multi-line formatting (`flex-col`) instead of flat rows.
- Updated `StreamStatusMonitor.tsx` to read directly from `/api/config/poller-health`.
- Removed structural clutter (redundant alert bagde) from `DashboardView.tsx`.
- Remapped `DASHBOARD_STREAMS` explicitly against active backend internal IDs.
- Guarded GeoJSON properties accesses in `buildFIRMSLayer.ts` with `!` null assertions and stubbed unused params with `_now`.

## Verification
- Verified Stream Monitor states mirror poller registry accurately with real-world fallback handling (STALE, ERROR).
- Verified header flex boundaries successfully handle multi-line rendering for extreme alert counts.
- Pre-release verification hook ran `pnpm test`, `typecheck`, and `lint` against modified artifacts.

## Benefits
- Real-time data outage visibility is fully surfaced to operators.
- Increased dashboard density without sacrificing readability on variable display scales.
