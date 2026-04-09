# Pre-Release Skill Creation

## Issue

Release readiness checks were being run ad-hoc, which increases the risk of missing changelog updates, incomplete verification coverage, or unclear GO/HOLD decisions during v1.x patch planning.

## Solution

Added a reusable workspace skill that standardizes a pre-release audit workflow and release-decision gate for Sovereign Watch.

## Changes

- Created `.github/skills/pre-release/SKILL.md`.
- Added a step-by-step readiness workflow covering scope classification, changelog/task-log validation, targeted verification commands, migration checks, and final GO/HOLD output.
- Included a v1.x decision policy for patch-now vs batch-later choices.

## Verification

- Confirmed skill file location and YAML frontmatter structure.
- Verified editor diagnostics report no errors for the new skill and task note files.

## Benefits

- Reduces release-process drift and missed release hygiene steps.
- Makes release decisions repeatable and operator-impact focused.
- Aligns v1.x cadence with explicit criteria instead of intuition alone.
