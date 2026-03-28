# 2026-03-28 - Holding Alert Routing to Intel Feed

## Issue
Holding-pattern notifications were filling the Alerts widget and obscuring higher-priority alerts, despite many hold events being informational rather than urgent.

## Solution
Routed non-critical holding notifications to the Intel Feed and reserved Alerts-widget entries for critical hold cases only.

## Changes
- Updated `frontend/src/components/map/TacticalMap.tsx`:
  - Added `HOLD_CRITICAL_TURNS = 5.0` threshold.
  - In holding event emission logic:
    - `turns_completed >= 5` -> event `type: "alert"` (Alerts widget).
    - `turns_completed < 5` -> event `type: "new"` (Intel Feed).
  - Message prefix now reflects severity routing:
    - Critical: `ALERT: ...`
    - Non-critical: `HOLD: ...`

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Reduces Alerts widget saturation and preserves high-signal visibility.
- Keeps holding maneuver awareness in Intel Feed where it remains actionable context.
- Maintains escalation for critical sustained holds.
