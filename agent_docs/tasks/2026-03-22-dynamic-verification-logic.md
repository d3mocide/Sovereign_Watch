# Task: Dynamic Targeted Verification Logic

## Issue

The current verification rules in `AGENTS.md` are interpreted as mandatory broadly, leading to inefficient execution of linting/testing for languages or services that were not modified (e.g., running `pnpm run lint` when only editing Markdown files).

## Solution

1. Introduce a "Targeted Verification Rule" in `AGENTS.md` Section 5.
2. Provide a decision matrix/table that maps modified file types to their respective verification commands.
3. Explicitly state that code linting/testing should be skipped if only documentation (`.md`) was changed.
4. Align `CLAUDE.md` with these efficiency rules.

## Changes

- Modified `AGENTS.md`: Updated Section 5 with a Targeted Verification efficiency rule and matrix.
- Modified `CLAUDE.md`: Added a note regarding conditional verification.

## Verification

- Cross-referenced file types with project structure to ensure all services are covered.
- Validated Markdown formatting of the new tables.

## Benefits

- Significant reduction in task completion time for documentation-only or single-service tasks.
- Avoids unnecessary container overhead and host tool usage for irrelevant subsystems.
