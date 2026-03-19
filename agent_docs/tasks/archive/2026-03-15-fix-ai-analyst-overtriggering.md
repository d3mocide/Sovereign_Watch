# 2026-03-15-fix-ai-analyst-overtriggering

## Issue
The AI Analyst widget (`AIAnalystPanel`) was firing automatically and excessively (multiple requests per second), leading to `429 Too Many Requests` errors. This happened because the analysis was triggered by an effect that depended on the `entity` object. Since the `entity` (position, speed, etc.) is updated in real-time almost every frame, it caused the effect to re-run constantly.

## Solution
1. **Decouple Trigger from State Updates**: Changed the `useEffect` dependency from the full `entity` object to just `entity?.uid`.
2. **One-Shot Trigger with Ref**: Implemented a `prevTriggerRef` to ensure the `run` call only executes when the `autoRunTrigger` value (a timestamp) actually changes from its previous state.
3. **Optimized Reset Logic**: Moved the `isSettingsOpen` reset logic to the render phase to avoid synchronous `setState` calls in `useEffect`, resolving a React best practices lint error.

## Changes
- `frontend/src/components/widgets/AIAnalystPanel.tsx`:
    - Added `prevTriggerRef`.
    - Updated `useEffect` for analysis execution to use the ref and limited dependency array.
    - Resolved `exhaustive-deps` lint error by extracting `entity.uid` to a stable `entityUid` variable outside the effects.
    - Updated `useEffect` for cleanup to use `entityUid`.
    - Moved settings drawer reset to render phase.

## Verification
- Opened AI Analyst for a moving track and verified only one analysis request is sent.
- Verified that switching tracks correctly resets the panel.
- Ran `npm run lint` and verified no new errors in `AIAnalystPanel.tsx`.
