# Tools

This folder contains local helper scripts for development workflows.

## Dependency Security Audit

Script: `audit-deps.sh`

Purpose: Audit all uv and pnpm lockfiles for known CVEs using `pip-audit` (Python) and `pnpm audit` (JS).

### What It Covers

| Component | Lockfile |
|-----------|----------|
| backend-api | `backend/api/uv.lock` |
| aviation-poller | `backend/ingestion/aviation_poller/uv.lock` |
| maritime-poller | `backend/ingestion/maritime_poller/uv.lock` |
| infra-poller | `backend/ingestion/infra_poller/uv.lock` |
| rf-pulse | `backend/ingestion/rf_pulse/uv.lock` |
| js8call | `js8call/uv.lock` |
| frontend | `frontend/pnpm-lock.yaml` |

> **Note:** `gdelt_pulse` and `space_pulse` have `pyproject.toml` but no `uv.lock` yet.
> Run `uv lock` in those directories to enable auditing.

### Usage

Run from repository root:

```bash
bash tools/audit-deps.sh
```

### Options

- `--components <list>`: audit only selected components (comma-separated)
- `--continue-on-failure`: keep auditing after a failure instead of stopping
- `--min-severity <level>`: minimum severity to flag — `low` | `moderate` | `high` | `critical` (default: `low`)
- `--fix-versions-only`: only report vulnerabilities that have a known fix available

### Examples

Audit everything:

```bash
bash tools/audit-deps.sh
```

Audit only Python backend components:

```bash
bash tools/audit-deps.sh --components backend-api,aviation-poller,maritime-poller,infra-poller,rf-pulse,js8call
```

Audit all and continue past failures to see the full picture:

```bash
bash tools/audit-deps.sh --continue-on-failure
```

Only flag high/critical vulnerabilities:

```bash
bash tools/audit-deps.sh --min-severity high
```

### Output

The script prints per-component audit results with vulnerability details, then a final summary table with pass/fail status and elapsed time per component.

Exit code:
- `0` when all audited components are clean
- `1` when any component has vulnerabilities or an audit error occurs

---

## CI Dry Run Helper

Script: `run-ci-checks.ps1`

Purpose: Run workflow-equivalent checks locally (all jobs or selected jobs) before pushing.

### What It Covers

- Frontend: lint + tests
- Backend API: pytest
- Aviation poller: pytest
- Maritime poller: pytest
- RF pulse: pytest
- Space pulse: pytest
- Infra poller: pytest
- GDELT pulse: pytest
- JS8Call: pytest

### Usage

Run from repository root:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1
```

### Common Options

- `-Jobs <list>`: run only selected jobs.
- `-ChangedFiles <list>`: auto-select jobs based on changed paths (using the same mapping as `.github/workflows/ci.yml`).
- `-InstallDeps`: install each job's CI dependencies before running tests.
- `-ContinueOnFailure`: keep running remaining jobs after one fails.
- `-VerbosePytest`: run pytest with `-vv` for more detail.

### Examples

Run all jobs:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1
```

Run selected jobs:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs backend-api,rf-pulse
```

Run based on changed files:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -ChangedFiles backend/api/main.py,js8call/server.py
```

Run all jobs and continue through failures:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs all -ContinueOnFailure
```

Install dependencies then run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run-ci-checks.ps1 -Jobs all -InstallDeps
```

### Output

The script prints:

- per-job command execution
- pass/fail status per job
- elapsed time per job
- final summary table

Exit code:

- `0` when all selected jobs pass
- `1` when any selected job fails
