# 2024-03-09 - Palette UX: Buttons outline-none

## Problem
In several UI components, buttons were missing `outline-none` when combined with `focus-visible:ring-1`. This resulted in default browser outlines (typically a thick blue ring or similar) appearing in addition to the intended custom focus rings when the element received focus, degrading visual polish and keyboard accessibility.

## Solution
1. Add `outline-none` class to all buttons and interactive elements that already implement a custom `focus-visible:ring-1` or similar.
2. Verified changes in `OrbitalMap.tsx`, `TacticalMap.tsx`, `SystemStatus.tsx`, `AlertsWidget.tsx`, `AnalysisWidget.tsx`.
