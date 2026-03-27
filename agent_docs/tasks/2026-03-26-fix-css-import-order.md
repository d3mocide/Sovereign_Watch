# 2026-03-26-fix-css-import-order

## Issue
The frontend container reported a PostCSS error: `[vite:css][postcss] @import must precede all other statements`. This happened because the Google Fonts `@import` was placed after `@import "tailwindcss"`. In Tailwind CSS v4, the latter adds rules, making subsequent imports invalid.

## Solution
Moved the external font `@import` to the top of `src/index.css`, before the Tailwind import.

## Changes
### Frontend
- Modified `frontend/src/index.css`: Swapped `@import "tailwindcss"` and the Google Fonts `@import`.

## Verification
- Verified the file content via `view_file`.
- Attempted `pnpm run build` on host (blocked by missing dependencies unrelated to CSS, but confirmed CSS structure is standard).

## Benefits
- Resolves build/HMR failures in the frontend container.
- Ensures cross-browser compatibility for font loading.
