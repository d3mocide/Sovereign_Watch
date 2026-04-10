## Issue
The regional risk panel was showing markdown-like analyst output as flattened plain text. Even after the narrative quality improved, section headers and bullets were not rendered with the same formatting used by the AI Analyst panel.

## Solution
Extracted the lightweight analyst markdown renderer into a shared widget component and reused it in the regional risk overlay. This keeps the markdown cleanup and visual treatment consistent across both analysis surfaces.

## Changes
- Added frontend/src/components/widgets/AnalysisFormatter.tsx as a shared renderer for analyst-style markdown output.
- Updated frontend/src/components/widgets/AIAnalystPanel.tsx to use the shared AnalysisFormatter component instead of keeping a local copy.
- Updated frontend/src/App.tsx so the regional risk overlay renders narrative_summary through AnalysisFormatter.

## Verification
- cd frontend && pnpm run lint
- cd frontend && pnpm run typecheck
- cd frontend && pnpm run test
- Result: frontend lint passed, typecheck passed, and 184 tests passed.

## Benefits
Regional risk narratives now render with the same section and bullet formatting as the AI Analyst panel, which makes the assessment easier to scan and keeps presentation consistent across the product.
