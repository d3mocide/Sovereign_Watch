# Fix Python Smoke Editable Install Failure

## Issue

The Python smoke workflow failed in GitHub Actions when running editable installs for backend API:

- `pip install -e .` triggered setuptools package auto-discovery.
- Backend API uses a flat layout with multiple top-level packages (`core`, `proto`, `models`, `routers`, `services`).
- setuptools rejected the editable build with a `Multiple top-level packages discovered in a flat-layout` error.

## Solution

Updated each Python smoke step to install dependencies directly from `pyproject.toml` metadata instead of performing editable installs.

For each smoke service step:

- Parse `project.dependencies` and `dependency-groups.dev` with `tomllib`.
- Install the resulting dependency list using `python -m pip install --quiet ...`.
- Run the targeted smoke pytest command.

This avoids package build/discovery entirely while preserving dependency parity from each service's source of truth.

## Changes

### `.github/workflows/ci.yml`

- Removed `pip install -e .` from Python smoke steps.
- Added metadata-driven dependency install snippets for:
  - backend API smoke
  - aviation poller smoke
  - space pulse smoke
  - infrastructure poller smoke

## Verification

- YAML validates in editor diagnostics with no errors.
- Logic aligns with the reported failure mode by eliminating editable builds.

## Benefits

- Prevents setuptools packaging-layout errors from blocking smoke CI.
- Keeps dependency source aligned with service `pyproject.toml` files.
- Maintains lightweight smoke checks without reintroducing full matrix overhead.
