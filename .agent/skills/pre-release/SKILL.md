---
name: pre-release
description: "WORKFLOW SKILL - Sovereign Watch pre-release readiness and release decision gate. Use when: preparing a release candidate, deciding patch release vs batching, validating changelog coverage, confirming verification command coverage, checking migration/docs/task-log completeness, and producing a GO or HOLD recommendation for v1.x."
---

# Pre-Release Readiness

## Purpose

Run a repeatable release-readiness workflow before cutting any v1.x release.

This skill is for process and decision support. It does not force a release.

## Trigger Phrases

- pre-release check
- release readiness
- should we ship 1.0.x now
- patch release gate
- go/no-go release
- release candidate audit

## Inputs

- Target branch (default: dev)
- Candidate scope (single commit, commit range, or "all Unreleased")
- Proposed version (optional)
- Release urgency (optional)

## Workflow

1. Identify release scope.
- Collect commits/files in scope and classify by impact:
  - operator trust and data correctness
  - security
  - runtime stability and regressions
  - UX/docs/maintenance

2. Verify changelog coverage.
- Ensure [CHANGELOG.md](../../../CHANGELOG.md) has a clear Unreleased summary for all in-scope changes.
- Confirm entries use Added/Changed/Fixed categories with operator-facing wording.

3. Verify task-log coverage.
- Confirm each in-scope implementation task has a corresponding file in [agent_docs/tasks](../../../agent_docs/tasks).

4. Run targeted verification by touched component.
- Frontend changes:
  - cd frontend
  - pnpm run lint
  - pnpm run typecheck
  - pnpm run test
- Backend API changes:
  - cd backend/api
  - uv tool run ruff check .
  - uv run python -m pytest
- Ingestion poller changes:
  - cd backend/ingestion/<poller>
  - uv tool run ruff check .
  - uv run python -m pytest
- JS8 service changes:
  - cd js8call
  - uv tool run ruff check .
  - uv run python -m pytest
- Docs-only changes:
  - Skip code suites; validate markdown consistency and diagnostics.

5. Check migration and deployment impact.
- If schema changed, verify a migration exists under [backend/db/migrations](../../../backend/db/migrations).
- Confirm no post-deploy schema edits were made in [backend/db/initdb](../../../backend/db/initdb).
- Confirm relevant deployment/config docs are updated when env/runtime behavior changed.

6. Apply v1.x release decision gate.
- Recommend RELEASE NOW for patch when one or more apply:
  - operator-facing data correctness bug fixed
  - security fix
  - production-facing runtime or integrity defect fixed
- Recommend BATCH for next patch when changes are mostly:
  - documentation
  - refactors/internal quality
  - non-urgent UI polish

7. Produce decision output.
- GO/HOLD verdict
- risk summary
- verification summary
- changelog status
- suggested version bump (or defer)

## Output Template

Use this structure in the final pre-release report:

- Scope: commits/files included
- Risk Level: low/medium/high
- Verification: commands run and outcomes
- Changelog: complete/incomplete
- Migration Check: pass/fail/not-applicable
- Decision: GO or HOLD
- Recommendation: release now (x.y.z) or batch into next patch

## v1.x Policy Guidance

Default for Sovereign Watch v1.x:

- Patch now when operator trust or data correctness is affected.
- Batch when impact is mostly docs, housekeeping, or low-risk polish.
- Keep release notes concise and operator-first.

## Anti-Patterns

- Releasing only because commits exist.
- Shipping without changelog updates.
- Mixing unrelated high-risk and low-risk changes without clear notes.
- Treating a failing verification gate as optional.
