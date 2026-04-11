---
agent: ask
model: GPT-5.3-Codex
description: "Generate a standardized pre-release GO/HOLD summary for Sovereign Watch v1.x. Use when: release readiness review, patch-vs-batch decision, and final pre-release reporting."
---

Create a pre-release readiness summary for Sovereign Watch using the standard gate.

## Scope
- Target branch: `${input:branch:dev}`
- Scope selector: `${input:scope:Unreleased}`
- Candidate version: `${input:version:(optional)}`
- Urgency: `${input:urgency:normal}`

## Required Analysis
1. Determine in-scope commits/files for the selected scope.
2. Classify impact by:
- operator trust and data correctness
- security
- runtime stability/regressions
- UX/docs/maintenance
3. Validate changelog coverage in `CHANGELOG.md`.
4. Validate task-log coverage in `agent_docs/tasks/`.
5. Validate migrations policy:
- If schema changed, verify migration exists in `backend/db/migrations/`.
- Confirm no post-deploy schema changes were made in `backend/db/initdb/`.
6. Summarize verification status from recent command evidence and/or reruns where needed.
7. Apply v1.x release policy:
- Prefer RELEASE NOW for operator-trust/data-correctness/security/runtime fixes.
- Prefer BATCH for docs/refactor/polish-heavy changes.

## Output Format (use exactly)
- Scope:
- Risk Level: low|medium|high
- Verification:
- Changelog: complete|incomplete
- Migration Check: pass|fail|not-applicable
- Decision: GO|HOLD
- Recommendation:

## Notes
- Keep it concise and operator-facing.
- If verification is blocked by environment issues, state blocker and confidence impact explicitly.
- Do not fabricate test outcomes.
