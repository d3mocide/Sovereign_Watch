# Final release gates: v1.2.0

- Scope: v1.1.3 through the mobile/performance foundation (985d3e8, merged by
  PR #347) and radio recovery (104b751), plus release documentation and frontend
  package metadata.
- Risk Level: medium.
- Verification: GO on existing exact-source code evidence; final release commit
  and main merge must pass GitHub CI before publishing the tag/release.
- Changelog: complete; Unreleased changes are promoted into the dated v1.2.0
  section, including the radio fixes.
- Migration Check: pass; V007 exists and is applied on the running stack, with
  `timescaledb,pg_stat_statements` preloaded. No bootstrap schema edits.
- Decision: GO, subject to final commit and main CI.
- Recommendation: release now as v1.2.0, incorporating the verified radio fix.

## Issue

The existing v1.2.0 candidate had stale draft notes and omitted the radio
recovery. The user authorized merging dev into main and publishing a stable
release after running the release gates.

## Solution

Use the repository pre-release skill and release workflow, review the scope
against the last stable tag, finalize operator-facing notes, and require green
CI for the release commit and main merge before creating an annotated stable tag.

## Changes

- `CHANGELOG.md`: finalize v1.2.0 dated release coverage and include radio recovery.
- `RELEASE_NOTES.md`: replace draft state, explain runtime/deployment changes,
  include radio rebuild/test guidance and preserve known verification limits.
- `frontend/package.json`: align package version with the stable release.
- This task log records the gate decision and release scope. Existing foundation
  and radio task logs retain their detailed historical evidence.

## Verification

- Radio dev CI 37711526437 passed all jobs: frontend lint/typecheck/tests/build,
  and lint/tests for API, aviation, maritime, space, RF, infrastructure, GDELT,
  TAK clausalizer and radio.
- Local radio task evidence: 318 frontend tests and 40 radio tests; compatible
  Docker images; exact-text WAV replay; real on-air decodes; real waterfall
  rendering at 1440x900 and 390x844; critical-child shutdown and auth checks.
- Foundation evidence: 819 Python tests with two skips and 316 frontend tests;
  relevant Docker builds, Redis concurrency checks, and mobile browser checks.
- Read-only storage/runtime audit passed: V001–V007 applied, all latest
  retention/compression jobs successful, bounded JSON logs and stable consumers.
  Cumulative historical job failures were not reset.
- Four volumes are referenced by existing containers. Unreferenced volumes were
  not deleted. The stack remains on its existing volumes.
- Compose config validation passed. No schema additions to initdb.
- Final release metadata build, documentation links, dev/main CI and publication
  are verified during release execution; publication is blocked on failing CI.

## Benefits

A stable release includes working mobile workspaces and radio reception,
performance/storage controls, complete upgrade notes and reproducible gates.
