# Release - v0.46.4 - CI Reliability & Agent Tooling Standardization

## High-Level Summary

This release focuses on developer and agent reliability: CI jobs now install the dependencies their tests actually import, release-risky manual scripts are removed from pytest discovery, and project guidance is standardized around host-first code checks with Docker-first runtime parity. The result is fewer false CI failures and a more deterministic workflow for both humans and coding agents.

## Key Features

- **Local CI Dry-Run Command**: Added `tools/run-ci-checks.ps1` to mirror CI jobs locally (all jobs, selected jobs, or changed-file-derived selection).
- **Integrated Developer Docs**: Added `tools/README.md` and documented local CI dry-run usage in `Documentation/Development.md`.
- **Agent Policy Alignment**: Unified guidance in `AGENTS.md` for host-first lint/tests/static analysis and Docker-first runtime validation.

## Technical Details

- **CI Workflow Hardening** (`.github/workflows/ci.yml`):
  - Added missing backend test dependencies (`uvicorn`, `pyyaml`, `protobuf`).
  - Added poller/runtime deps where required by tests (`aiohttp`, `psycopg2-binary`, etc.).
  - Simplified frontend test invocation to use the script-defined non-watch mode.
- **Test Suite Stability**:
  - `js8call/tests/test_json.py`, `test_ws.py`, and `test_kiwi.py` were moved to `manual_test_*.py` names to prevent external-network calls during pytest collection.
  - Added missing `__init__.py` files to test directories to reduce namespace/collection ambiguity.
  - Updated async helper wrappers in `rf_pulse` and `gdelt_pulse` tests to use `asyncio.run`, fixing Python 3.14 event-loop compatibility issues.
  - Strengthened backend API tests with explicit dependency stubs for collection-time imports in minimal local environments.
- **Dev Tooling Standardization**:
  - Standardized active docs and internal agent assets on `pyproject.toml` + `uv.lock` for Python dependencies.
  - Standardized on Pylance (language intelligence) + Ruff (lint/format) in guidance and VS Code settings.

## Upgrade Instructions

1. Pull latest changes:

```bash
git pull origin dev
```

2. Rebuild and restart runtime services for parity:

```bash
docker compose up -d --build
```

3. Run local CI dry-run before pushing:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs all -ContinueOnFailure
```

4. If only specific areas changed, run targeted suites:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs frontend,backend-api,rf-pulse,gdelt-pulse,js8call
```

5. Optional focused dependency install in local CI dry-run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs all -InstallDeps
```
