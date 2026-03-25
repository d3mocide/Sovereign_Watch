# 2026-03-24-release-v0-47-2-settings-modularity-preset-expansion

## Issue
A release preparation pass was requested to package the latest frontend changes on `dev`, specifically:
1. System settings + listening post refactoring work already merged.
2. New filter preset expansion work currently in progress.

## Solution
Executed the repository release workflow from `.agent/workflows/release.md` as an in-repo documentation and verification process:
1. Verified git state and release baseline from latest tag (`v0.47.1`).
2. Updated changelog with a new `0.47.2` section.
3. Overwrote release notes for `v0.47.2` with operator-facing summary and upgrade instructions.
4. Ran targeted frontend verification and frontend container parity build.

## Changes
- `CHANGELOG.md`
  - Added `## [0.47.2] - 2026-03-24` section documenting preset expansion and modular refactor scope.
  - Restored missing `0.47.0` section header continuity near the top of the file.
- `RELEASE_NOTES.md`
  - Updated release title/content to `v0.47.2 - Settings Modularity + Preset Expansion`.
  - Documented key feature and technical detail coverage for settings/listening-post modularization and filter preset expansion.
  - Corrected compose parity command to `docker compose build sovereign-frontend`.

## Verification
- Host frontend checks:
  - `cd frontend && pnpm run lint` (PASSED)
  - `cd frontend && pnpm run test` (PASSED)
- Docker parity build:
  - `docker compose build sovereign-frontend` (PASSED)

## Benefits
- Release artifacts now accurately describe the latest frontend architectural changes and operator-facing preset additions.
- Operators have updated upgrade instructions aligned with current compose service naming.
- The release preparation now has a documented audit trail in `agent_docs/tasks/`.
