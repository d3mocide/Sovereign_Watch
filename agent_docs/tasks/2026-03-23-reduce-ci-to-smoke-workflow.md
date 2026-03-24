# Reduce CI To Smoke Workflow

## Issue

The full GitHub CI matrix had become noisy and expensive to troubleshoot, and repeated failures were slowing down iteration. The team requested a lighter approach that still provides an upstream signal while relying on local verification for full coverage.

## Solution

Replaced the multi-job test matrix with a compact smoke-check workflow in GitHub Actions. The new workflow keeps path-based change detection but runs only:

- Frontend typecheck smoke.
- Python smoke checks for representative suites in backend API, aviation poller, space pulse, and infrastructure poller.

Full verification remains available locally via `tools/run-ci-checks.ps1`.

## Changes

### `.github/workflows/ci.yml`

- Renamed workflow to `CI Smoke`.
- Reduced change-detection outputs to `frontend` and `python`.
- Removed per-component CI jobs for the full matrix.
- Added `frontend-smoke` job:
  - Installs frontend dependencies.
  - Runs `pnpm run typecheck`.
- Added `python-smoke` job that runs representative tests:
  - `backend/api/tests/test_cors.py`
  - `backend/ingestion/aviation_poller/tests/test_utils.py`
  - `backend/ingestion/space_pulse/tests/test_orbital.py`
  - `backend/ingestion/infra_poller/tests/test_infra.py`

## Verification

- YAML validated in editor diagnostics (no errors).
- Local full verification path remains available and was previously validated using:
  - `./tools/run-ci-checks.ps1 -Jobs @('backend-api','aviation-poller','space-pulse','infra-poller')`

## Benefits

- Faster and more stable GitHub signal on pull requests.
- Lower CI runtime and reduced dependency churn in hosted runners.
- Keeps cloud CI as a guardrail while moving comprehensive checks to a controlled local path.
