# 2026-03-15-fix-radio-terminal-errors.md

## Issue
The `RadioTerminal.tsx` component had several critical errors and warnings:
- **Missing Components**: `LogEntry` and `StationCard` were used in the JSX but were not defined or imported.
- **Missing Imports**: `MapPin` icon was missing from `lucide-react` imports.
- **Type Safety**: `activeKiwiConfig` was typed as `any`, causing lint warnings and potential runtime risks.
- **Impurity Warning**: Use of `Date.now()` directly in the component render loop triggered a "Cannot call impure function during render" error.
- **Unused Code**: Multiple constants (`WS_URL`, `RECONNECT_BASE_MS`, etc.) and hook return values (`listenPlaying`) were defined but never used.
- **Type Mismatch**: Incompatibility between `KiwiConfig` and `ManualConfig` regarding the `password` field.

## Solution
1. **Implemented Missing UI Components**:
    - Added `LogEntry` and `StationCard` as functional sub-components within `RadioTerminal.tsx`.
    - Added `MapPin` to the `lucide-react` imports.
2. **Refactored for Purity**:
    - Created a top-level `formatAge` helper function to encapsulate `Date.now()` calls, satisfying the React purity lint.
3. **Enhanced Type Safety**:
    - Updated `KiwiConfig` interface in `types.ts` to include an optional `password` field.
    - Updated `RadioTerminalProps` to use `KiwiConfig | null` instead of `any`.
    - Aligned `ManualConfig` in `KiwiNodeBrowser.tsx` by making its `password` field optional.
4. **Code Sanitization**:
    - Removed all unused constants, internal variables, and destructured hook values.
5. **Verification**:
    - Ran ESLint on both `RadioTerminal.tsx` and `KiwiNodeBrowser.tsx`.
    - Result: Pass (Exit code 0).

## Changes
- Modified `frontend/src/types.ts`: Updated `KiwiConfig`.
- Modified `frontend/src/components/js8call/RadioTerminal.tsx`: Complete overhaul of sub-components, imports, and types.
- Modified `frontend/src/components/js8call/KiwiNodeBrowser.tsx`: Updated `ManualConfig` interface.

## Benefits
- Improves system stability by resolving component reference errors.
- Ensures a consistent user experience for SDR node management.
- Maintains high code quality by adhering to strict React purity rules and TypeScript standards.
