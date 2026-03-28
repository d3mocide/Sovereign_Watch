# 2026-03-28 - Holding Pattern Detection Tightening

## Issue
Holding pattern detections were being flagged too early (often before a full turn), and stale turn history could continue to influence active state decisions longer than intended.

## Solution
Tightened the detector while preserving operator configurability through environment variables:
- Increased default turn threshold to a full turn.
- Added hard gates for minimum circling duration and directional consistency.
- Recomputed rolling-window turn metrics from in-window heading history to keep detection state aligned with the configured observation window.

## Changes
- Updated holding pattern detector logic in `backend/ingestion/aviation_poller/holding_pattern.py`:
  - Added clamped env parsing helpers.
  - Set safer defaults (e.g., 360-degree threshold).
  - Added signed turn tracking and directional-consistency gating.
  - Enforced minimum circling duration as a hard detection gate.
  - Rebuilt turn totals during stale-eviction passes so total turn reflects only in-window data.
  - Added `directional_consistency` to published holding pattern properties.
- Updated environment defaults in `.env` and `.env.example`:
  - `HOLDING_PATTERN_THRESHOLD=360`
  - `MIN_CIRCLE_DURATION=90`
  - Added `MIN_DIRECTIONAL_CONSISTENCY=0.7`
- Updated tests in `backend/ingestion/aviation_poller/tests/test_holding_pattern.py`:
  - Aligned threshold expectations to full-turn gating.
  - Added duration-gate and directional-consistency-gate coverage.
  - Added timestamped ingestion for duration-sensitive integration tests.
- Updated docs:
  - `Documentation/Configuration.md`
  - `Documentation/pollers/ADSB.md`
  - `CHANGELOG.md`

## Verification
- `cd backend/ingestion/aviation_poller && ruff check .`
- `cd backend/ingestion/aviation_poller && python -m pytest`

## Benefits
- Reduces early and back-and-forth false-positive hold detections.
- Makes detector behavior more predictable for operators.
- Preserves mission-specific tuning through environment variables while providing stricter, safer defaults.
