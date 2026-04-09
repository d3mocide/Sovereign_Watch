# 2026-04-08 AI Analyst Panel Format Copy Fix

## Issue
AI Analyst output in the frontend panel was preserving some hard-wrapped word fragments from model output, which caused words like `NARRATIVE` and `SNAPSHOT` to render with their last letter on a new line. Follow-up testing also exposed stray standalone `-` lines, trailing `-` artifacts after scalar fields, and consecutive markdown headers rendering as two separate section banners. The panel's `EXPORT_DATA` action was also relying only on `navigator.clipboard.writeText`, so clipboard permission or context failures caused copy/export to stop working silently.

## Solution
Tightened the frontend formatter so it heals short trailing word fragments and common streamed markdown artifacts before rendering or exporting. Added follow-up cleanup for stray bullet-marker debris and consecutive markdown headers emitted by the model. Reworked the export action to use a legacy textarea copy fallback when the async Clipboard API is unavailable or rejected, and surfaced failure state in the button label.

## Changes
- Updated `frontend/src/components/widgets/AIAnalystPanel.tsx`:
  - Exported and improved `formatAnalysisText`.
  - Healed `* *` bold-fence splits and short trailing fragments like `NARRATIV\nE`.
  - Removed risky hyphenation styling from the rendered analyst text block.
  - Added clipboard fallback logic and visible `COPY_FAILED` feedback.
- Updated `frontend/src/components/widgets/aiAnalystFormatting.ts`:
  - Removed stray standalone dash lines and trailing dash artifacts from scalar fields.
  - Preserved markdown headers when a stray bullet marker was prefixed during streaming cleanup.
  - Demoted immediately consecutive markdown headers so `NARRATIVE` plus `CLASSIFICATION` renders as a section plus subheading rather than two peer banners.
- Added `frontend/src/components/widgets/AIAnalystPanel.test.ts` regression coverage for formatter healing behavior.

## Verification
- `cd frontend && pnpm run lint`
- `cd frontend && pnpm run typecheck`
- `cd frontend && pnpm run test`

## Benefits
- Analyst narratives render as intact words instead of visibly broken fragments.
- Analyst sections no longer show stray standalone dash rows or malformed header stacks.
- Exported analyst text now matches the cleaned on-screen content more reliably.
- Operators receive explicit failure feedback if browser clipboard access is blocked.