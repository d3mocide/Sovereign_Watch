# 2026-03-31-fix-frontend-h3js-import-runtime

## Issue
Frontend rendered a blank screen with runtime error:
`The requested module '/node_modules/.vite/deps/h3-js.js?...' does not provide an export named 'default'`.

The map context menu imported `h3-js` as a default export, which is incompatible with the installed package/export format.

## Solution
Replaced the default `h3-js` import with a named import and updated usage accordingly.

## Changes
- `frontend/src/components/map/MapContextMenu.tsx`
  - Changed `import h3 from 'h3-js';` to `import { latLngToCell } from 'h3-js';`
  - Changed `h3.latLngToCell(...)` to `latLngToCell(...)`

## Verification
- `pnpm run lint` passed.
- `pnpm run test` passed (36 tests).

## Benefits
Eliminates the browser runtime import error and restores map UI rendering while keeping H3 region analysis behavior intact.
