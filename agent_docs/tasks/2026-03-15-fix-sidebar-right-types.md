# 2026-03-15-fix-sidebar-right-types.md

## Issue
The `SidebarRight.tsx` component had TypeScript errors and lint warnings in the `infra` entity branch:
- `Property 'type' does not exist on type '{}'.` at line 440.
- `Unexpected any. Specify a different type.` at line 439.

This was due to improper typing of the `detail` object for infrastructure entities, which was being cast to `any` or inferred as an empty object.

## Solution
Defined explicit interfaces `InfraProperties` and `InfraDetail` to properly describe the structure of infrastructure entity metadata. Applied these types via a cast in the `infra` branch of the `SidebarRight` component, replacing the `any` cast and ensuring type safety for `properties` and `geometry` access.

## Changes
- Modified `frontend/src/components/layouts/SidebarRight.tsx`:
    - Added `InfraProperties` interface.
    - Added `InfraDetail` interface.
    - Updated `entity.type === 'infra'` branch to use `InfraDetail` type instead of `any`.
    - Removed `: any` type annotation on `props`.

## Verification
- Ran `npx eslint src/components/layouts/SidebarRight.tsx` in the `frontend` directory.
- Result: Exit code 0 (no errors or warnings).
- Verified that the `infra` branch logic remains correct and handles optional properties safely.

## Benefits
- Improved type safety and developer experience.
- Resolved lint warnings, contributing to a cleaner codebase.
- Avoided `any` usage in a core UI component.
