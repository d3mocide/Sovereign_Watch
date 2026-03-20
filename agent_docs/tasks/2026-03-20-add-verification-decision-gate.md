# 2026-03-20 - Add Verification Decision Gate

## Issue
Verification guidance was split between container-first principles and host-tool overrides, which could lead to inconsistent agent behavior and unnecessary overhead during lint/unit-test loops.

## Solution
Added an explicit verification decision gate that defines when to run host checks first and when Docker checks are mandatory for parity-critical validation.

## Changes
- Updated AGENTS.md:
  - Added a Verification Decision Gate section under Quality Gates.
  - Clarified host-first inner-loop checks (lint, unit tests, static analysis).
  - Clarified Docker-required parity-critical checks (builds, runtime, integration).
  - Preserved ingestion poller runtime rebuild requirement.
  - Added practical fallback order and pre-release Docker parity expectation.
- Updated CLAUDE.md:
  - Added a matching Verification Decision Gate aligned with host-tool override guidance.
  - Reinforced Docker-required checks for parity-sensitive validation.
  - Preserved strict containerized runtime validation for ingestion pollers.

## Verification
- Documentation review performed to ensure no conflict with existing container-first build/runtime policy.
- Verified both files now encode the same host-vs-docker decision sequence.

## Benefits
- Reduces unnecessary container overhead for rapid iteration.
- Preserves deployment/runtime parity where it matters.
- Gives agents and developers a single consistent decision path, reducing ambiguity and token churn in repeated troubleshooting loops.
