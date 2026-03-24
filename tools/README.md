# Tools

This folder contains local helper scripts for development workflows.

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
