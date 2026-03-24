# Sync Local CI Runner

## Issue

The repository already had a local verification helper in `tools/run-ci-checks.ps1`, but its Python dependency bootstrap no longer matched the GitHub workflow. That made the local script less trustworthy for reproducing CI behavior.

## Solution

Updated the local runner so each Python job installs its service in editable mode from the local `pyproject.toml` and adds only its test-only packages. This mirrors the current GitHub workflow model without removing CI.

## Changes

### `tools/run-ci-checks.ps1`

- Replaced hand-maintained Python package lists for runtime dependencies with `python -m pip install --quiet -e . ...`.
- Made the script prefer the repository `.venv` Python interpreter when present.
- Kept the existing job map and changed-file selection behavior.
- Left the frontend commands unchanged.

Updated jobs:

- `backend-api`
- `aviation-poller`
- `maritime-poller`
- `rf-pulse`
- `space-pulse`
- `infra-poller`
- `gdelt-pulse`
- `js8call`

## Verification

- Ran `& ./tools/run-ci-checks.ps1 -Jobs @('backend-api','aviation-poller','space-pulse','infra-poller')`
- Observed all four target jobs pass locally using the repository virtual environment.

## Benefits

- Local verification now tracks the same dependency source of truth as GitHub CI.
- Developers can reproduce CI-relevant failures faster without manually reconstructing Python installs.
- CI can remain as a clean-environment gate instead of being the only place failures are discovered.
