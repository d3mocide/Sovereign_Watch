## Issue
The shared analyst-style renderer improved the regional risk panel, but two presentation issues remained during user testing: uppercase tokens like GDELT could still break across lines, and long narrative output could grow past the usable height on small screens.

## Solution
Extended the markdown cleanup rules to heal hard-wrapped uppercase tokens in bullet content and wrapped the regional risk narrative in a bounded, scrollable container.

## Changes
- Updated frontend/src/components/widgets/aiAnalystFormatting.ts to heal bullet-wrapped uppercase token splits such as GDEL/T.
- Added a regression case in frontend/src/components/widgets/AIAnalystPanel.test.ts for uppercase token healing.
- Updated frontend/src/App.tsx to render the regional risk narrative inside a rounded, scrollable box with a fixed max height.

## Verification
- cd frontend && pnpm run lint
- cd frontend && pnpm run typecheck
- cd frontend && pnpm run test
- Result: frontend lint passed, typecheck passed, and 185 tests passed.

## Benefits
Regional risk narratives now stay readable on narrow screens and preserve key uppercase intelligence terms without awkward splits, improving scanability during live map use.
