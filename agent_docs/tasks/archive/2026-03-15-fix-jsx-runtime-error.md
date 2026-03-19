# 2026-03-15-fix-jsx-runtime-error.md

## Issue
TypeScript error: `This JSX tag requires the module path 'react/jsx-runtime' to exist, but none could be found.` This error typically occurs when the "Automatic JSX Transform" is enabled (`"jsx": "react-jsx"`) but the TypeScript compiler or IDE cannot resolve the `react/jsx-runtime` module, often due to a mismatch between host-side type definitions and container-side dependencies.

## Solution
1. Updated `frontend/tsconfig.json` to explicitly set `"jsxImportSource": "react"`, aiding module resolution for the JSX runtime.
2. Removed the explicit and restrictive `"types"` array in `tsconfig.json` to allow for broader automatic discovery of type definitions from `@types/*`.
3. Verified that the JSX runtime exists inside the `sovereign-frontend` container, confirming the issue is specific to the host environment's type resolution.

## Changes
- Modified `frontend/tsconfig.json`:
    - Added `"jsxImportSource": "react"`.
    - Removed `"types": ["vite/client", "react", "react-dom"]` (relying on `vite-env.d.ts` and automatic `@types` discovery).

## Verification
- Checked container file system: `react/jsx-runtime.js` exists in `node_modules` inside the container.
- Applied configuration changes to `tsconfig.json` which should resolve the error in most modern IDEs/compilers assuming the host environment can reach the types.

## Benefits
- Resolves blocking TypeScript errors during development and linting.
- Aligns `tsconfig.json` with modern Vite/React 18 recommendations.
- Improves IDE type discovery by removing restrictive type filters.
