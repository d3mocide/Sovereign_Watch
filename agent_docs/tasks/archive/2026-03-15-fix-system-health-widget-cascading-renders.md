# 2026-03-15-fix-system-health-widget-cascading-renders

## Issue
React lint error in `SystemHealthWidget.tsx`: "Calling setState synchronously within an effect can trigger cascading renders".
This occurs because `setLoading(true)` is called immediately inside a `useEffect` that triggers on `isOpen` change.

## Solution
Following React's recommendations for "Adjusting some state when a prop changes", I will move the loading state reset logic into the component's render phase (before the return) to avoid the post-render effect-driven re-render cycle.

## Changes
- Adjust `SystemHealthWidget.tsx` to handle `loading` state transitions more efficiently.
- Remove synchronous `setLoading(true)` from `useEffect`.

## Verification
- Run `npm run lint` in `frontend` directory.
- `npx eslint src/components/widgets/SystemHealthWidget.tsx` passed with 0 errors.
- Verified widget logic: `loading` state resets correctly when `isOpen` transitions to `true`.

## Benefits
- Improved performance by avoiding cascading renders.
- Compliance with modern React best practices and linting rules.
