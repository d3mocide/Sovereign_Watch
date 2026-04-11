# Release Readiness Audit And Workflow Cleanup (2026-04-11)

## Issue

The earlier addition of a dedicated `pre-release-gdelt-review` helper workflow did not match the intended release-readiness process. At the same time, the repository had a substantial unreleased scope across backend mission scoping, GDELT review, frontend analyst surfaces, and documentation, but `CHANGELOG.md` still had an empty `Unreleased` section. That made it impossible to issue a defensible GO/HOLD recommendation against the real candidate scope.

## Solution

Removed the ad hoc helper workflow and reverted the related Makefile and development-doc additions. Then added operator-facing `Unreleased` changelog coverage for the actual in-scope work and ran the required frontend and backend API verification suites for the touched components.

## Changes

- `Makefile`
  - Removed the `pre-release-gdelt-review` target.
- `Documentation/Development.md`
  - Removed the dedicated pre-release GDELT helper workflow section.
- `tools/pre-release-gdelt-review.ps1`
  - Removed the helper script.
- `CHANGELOG.md`
  - Added `Unreleased` entries covering the live-vs-experimental GDELT review surface, clausal external-driver labeling, mission-scoped clausal context changes, and mission GDELT prioritization.
- `agent_docs/tasks/2026-04-11-pre-release-gdelt-review-workflow.md`
  - Removed the superseded task log for the discarded helper workflow.

## Verification

- `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test`
  - Passed, `13` files and `187` tests.
- `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
  - Passed, `121 passed`.

## Benefits

- The release audit now reflects the actual unreleased product scope instead of an extra convenience workflow.
- `CHANGELOG.md` is back in sync with operator-facing changes, which is required for a real patch-release gate.
- The release decision can now be made on verified frontend/backend results with task-log and migration coverage checked against the current branch state.