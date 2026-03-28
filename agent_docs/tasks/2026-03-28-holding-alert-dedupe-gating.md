# 2026-03-28 - Holding Alert Dedupe and Quality Gating

## Issue
Holding-pattern alerts were still producing high volume in the frontend event feed, especially when many active holds existed or when the active-holds API briefly returned empty data and then repopulated.

## Solution
Hardened frontend alert emission logic to:
- Preserve dedupe state across temporary empty polls.
- Rate-limit re-alerts per aircraft with a cooldown window.
- Alert only for stronger hold detections (confidence, completed turns, and duration gates).

## Changes
- Updated `frontend/src/components/map/TacticalMap.tsx` holding alert effect:
  - Replaced `Set` dedupe with `Map<hex_id, lastAlertTimestamp>`.
  - Removed unconditional cache clear on empty feature collections.
  - Added per-aircraft cooldown (`HOLD_ALERT_RENOTIFY_MS = 20 minutes`).
  - Added quality gates before emitting alerts:
    - `confidence >= 0.7`
    - `turns_completed >= 1.0`
    - `pattern_duration_sec >= 120`
  - Added stale key eviction for bounded memory usage.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run test`

## Benefits
- Reduces analyst alert fatigue from noisy or weak hold detections.
- Prevents broad re-alert storms after transient API empties.
- Preserves actionable alerts while suppressing low-confidence maneuvers.
