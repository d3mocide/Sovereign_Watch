# AI Analyst Panel Theme Alignment

## Issue
The `AI_ANALYST` button within the property cards (handled by `AnalysisWidget.tsx`) and the actual `AIAnalystPanel.tsx` modal defaulted to `air-accent` (green) for Infrastructure, Repeaters, Towers, and JS8Call tags, leading to thematic inconsistency across the interface. 

## Solution
Modified both `AnalysisWidget.tsx` and `AIAnalystPanel.tsx` to extend their gradient fallback mappings beyond `isShip` and `isSat`. 

## Changes
- Updated `AnalysisWidget.tsx` to include `orange` logic mapping for `accentBg` and `accentBorder`.
- Updated `AIAnalystPanel.tsx`'s parsing logic to derive conditional styling variables mapping entity categories (e.g. `isTower`, `isRepeater`, `isJS8`, `isInfra`) matching those used in `SidebarRight.tsx`.

## Verification
- Verified by inspecting frontend components with Vite HMR implicitly picking up changes seamlessly.
- Project lint step passed for critical compile errors (0 errors). 

## Benefits
UI now supports cohesive visual cues ensuring analysts can quickly interpret situational domains via distinct color themes matching the context of operations.
