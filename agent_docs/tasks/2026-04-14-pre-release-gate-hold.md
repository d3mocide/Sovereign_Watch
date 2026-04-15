## Issue

The repository had accumulated a substantial verified patch set across FIRMS, orbital cadence, SatNOGS, infra recovery, and frontend map behavior, but the release-facing documents still did not represent the actual candidate state. `RELEASE_NOTES.md` was stale and still declared a GO for an older scope, while the current branch still had two reported live blockers: ISS rendering and FIRMS dark-vessel behavior.

## Solution

Cut a real pre-release gate for the current patch candidate, updated the operator-facing release docs to reflect the verified branch scope, and marked the remaining live regressions explicitly as HOLD items rather than allowing them to be obscured inside a generic release summary.

## Changes

- Updated `CHANGELOG.md`
  - Expanded the `Unreleased` section to cover the verified patch-candidate scope across FIRMS, dark-vessel handling, orbital cadence, ReliefWeb v2, SatNOGS pagination, infra recovery, and outage-selection fixes.
  - Added a `Known Issues` section for the two remaining release blockers: ISS rendering runtime validation and FIRMS dark-vessel runtime validation.
- Updated `RELEASE_NOTES.md`
  - Replaced the stale GO-oriented release note with a pre-release HOLD gate summary.
  - Added sections for verified scope, verification summary, explicit HOLD items, and release recommendation.

## Verification

- Confirmed the latest backend API verification was green:
  - `docker compose exec sovereign-backend sh -lc "uv tool run ruff check . && uv run python -m pytest"`
  - Result: passed (`145` tests).
- Confirmed prior task-log verification coverage exists for:
  - Frontend ISS/FIRMS interaction changes.
  - `space_pulse` cadence and orbital scheduler fixes.
  - Infra poller outage geocoder and IXP recovery changes.
- Confirmed release-facing docs now represent a HOLD, not a GO, for the current candidate.

## Benefits

- Prevents an inaccurate GO release note from being used for the current patch candidate.
- Makes the remaining blockers explicit for the next session: ISS Rendering and FIRMS Dark Vessels.
- Preserves the verified fix set as the release candidate scope without overstating readiness.
