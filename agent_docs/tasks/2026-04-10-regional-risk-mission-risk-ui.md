## Issue
The backend could produce mission-scoped H3 risk, but the right-click regional analysis flow still only showed the AI router narrative. That left the operator without a direct mission-risk surface summary in the panel that initiated the analysis.

## Solution
Fetched mission-scoped H3 risk in parallel with the AI regional evaluation and surfaced a compact mission-risk summary in the existing regional risk overlay. Also recorded mission stats as a backlog item in the roadmap instead of changing the current global stats dashboard.

## Changes
- Updated frontend/src/api/h3Risk.ts with response-aware helpers that support mission-scoped H3 risk requests while preserving existing global H3 risk callers.
- Updated frontend/src/App.tsx so right-click regional analysis fetches mission-scoped H3 risk in parallel with the AI router evaluation.
- Added a compact mission-risk summary block to the regional risk overlay showing mission cell count, peak mission risk, peak severity, and linkage notes.
- Updated ROADMAP.md to backlog a separate mission stats namespace rather than overloading the existing global backend stats dashboard.

## Verification
- cd frontend && pnpm run lint
- cd frontend && pnpm run typecheck
- cd frontend && pnpm run test
- Result: lint passed, typecheck passed, and all 12 Vitest files passed (184 tests).

## Benefits
The right-click regional analysis panel now reflects both the narrative assessment and the mission-scoped risk surface, which makes the workflow more consistent with the new backend mission-risk capability. The stats dashboard semantics also remain clear because mission stats are explicitly deferred as a separate backlog item.
