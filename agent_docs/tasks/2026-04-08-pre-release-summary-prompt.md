# Pre-Release Summary Prompt

## Issue

The new pre-release skill defined workflow guidance, but operators still needed a fast one-command way to produce a standardized GO/HOLD report for v1.x release decisions.

## Solution

Added a reusable workspace prompt that asks for branch/scope/version context and outputs a fixed-format pre-release decision summary.

## Changes

- Created `.github/prompts/pre-release-summary.prompt.md`.
- Prompt enforces release-gate checks: scope/impact classification, changelog and task-log coverage, migration policy checks, verification status, and GO/HOLD decision.
- Added parameterized inputs for branch, scope, candidate version, and urgency.

## Verification

- Confirmed prompt file location and frontmatter fields.
- Verified editor diagnostics for prompt and task-note files.

## Benefits

- Enables fast, repeatable pre-release decision reports.
- Reduces release-review variance across sessions.
- Keeps v1.x patch cadence disciplined with explicit GO/HOLD criteria.
