# 2026-04-08 AI Analyst Panel Format Copy Fix

## Issue
AI Analyst output in the frontend panel was preserving some hard-wrapped word fragments from model output, which caused words like `NARRATIVE` and `SNAPSHOT` to render with their last letter on a new line. The panel's `EXPORT_DATA` action was also relying only on `navigator.clipboard.writeText`, so clipboard permission or context failures caused copy/export to stop working silently.

## Solution
Tightened the frontend formatter so it heals short trailing word fragments and common streamed markdown artifacts before rendering or exporting. Reworked the export action to use a legacy textarea copy fallback when the async Clipboard API is unavailable or rejected, and surfaced failure state in the button label.

## Changes
- Updated `frontend/src/components/widgets/AIAnalystPanel.tsx`:
  - Exported and improved `formatAnalysisText`.
  - Healed `* *` bold-fence splits and short trailing fragments like `NARRATIV\nE`.
  - Removed risky hyphenation styling from the rendered analyst text block.
  - Added clipboard fallback logic and visible `COPY_FAILED` feedback.
- Added `frontend/src/components/widgets/AIAnalystPanel.test.ts` regression coverage for formatter healing behavior.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run typecheck`
- `cd frontend && pnpm run test`

## Benefits
- Analyst narratives render as intact words instead of visibly broken fragments.
- Exported analyst text now matches the cleaned on-screen content more reliably.
- Operators receive explicit failure feedback if browser clipboard access is blocked.