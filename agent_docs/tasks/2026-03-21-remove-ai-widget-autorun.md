# Remove AI Widget and Disable Auto-Run

## Issue
The user requested the removal of the globally pinned `AIEngineWidget` from the `TopBar` component, as the AI functionality is now fully integrated into the Analyst Panel. Additionally, the user requested that when launching the Analyst Panel, the AI should wait for manual interaction before executing a query rather than auto-running automatically.

## Solution
1. **Remove Widget from TopBar**: We identified and excised the `AIEngineWidget` instance and its import from `frontend/src/components/layouts/TopBar.tsx`.
2. **Halt Auto-Run**: We located the trigger logic in `handleOpenAnalystPanel` within `frontend/src/App.tsx`. The auto-run behavior was disabled by removing `setAiAnalystAutoRun(Date.now())`, leaving the initial `aiAnalystAutoRun` value at 0. Because the `AIAnalystPanel` component explicitly checks for the truthiness of this trigger, leaving it un-updated stops it from auto-firing.

## Changes
- `frontend/src/components/layouts/TopBar.tsx` (Widget removed)
- `frontend/src/App.tsx` (Auto-run trigger halted)

## Verification
- Local build checks passed successfully (`pnpm run lint`, `pnpm run test`). 
- Verified logic flow indicating the AI engine pane starts with a "READY FOR INPUT" state rather than an immediate loading state. 

## Benefits
- Frees up valuable screen real estate in the TopBar HUD by centralizing AI features.
- Prevents unnecessary LLM API calls and improves user experience by allowing analysts to formulate their parameters before kicking off an analysis run.
