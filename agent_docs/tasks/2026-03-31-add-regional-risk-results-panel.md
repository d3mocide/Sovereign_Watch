# 2026-03-31 - Add Regional Risk Results Panel

## Issue
Regional risk analysis had no dedicated UI state. Operators only saw an "evaluating" Intel stream event and could not reliably tell whether the request was still running, completed, or failed.

## Solution
Added a map overlay panel for regional risk actions with explicit loading, success, and error states. Also added a client-side request timeout to prevent indefinite pending UX.

## Changes
- Updated [frontend/src/App.tsx](frontend/src/App.tsx):
  - Added `RegionalRiskUiState` and `regionalRiskUi` state.
  - Added request timeout (`15s`) with `AbortController` in `handleAnalyzeRegionalRisk`.
  - Added state transitions:
    - `loading` when request starts
    - `success` with risk payload when request returns
    - `error` with readable failure/timeout message
  - Added `regionalRiskOverlay` UI card rendered in Tactical and Orbital views.
  - Overlay shows:
    - target H3 region + coordinates
    - loading spinner and in-progress text
    - risk %, anomaly count, narrative summary
    - escalation indicators (top 3)
    - explicit error message when request fails
    - dismiss button

## Verification
- Ran frontend lint:
  - `cd frontend && pnpm run lint`
  - Result: pass
- Ran frontend tests:
  - `cd frontend && pnpm run test`
  - Result: pass (36 tests)

## Benefits
- Operators get immediate and persistent visual feedback for regional risk actions.
- Eliminates ambiguous "did it do anything?" UX.
- Improves resilience by surfacing timeout/failure directly in the UI.
