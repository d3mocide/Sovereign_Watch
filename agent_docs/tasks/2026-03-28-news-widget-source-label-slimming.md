# 2026-03-28 - News Widget Source Label Slimming

## Issue
The source identifier in full-view News widget rows looked like a button/chip, which felt visually heavy for simple source metadata.

## Solution
Simplify the source treatment to text-only colored typography without border/background chip styling.

## Changes
- Updated frontend/src/components/widgets/NewsWidget.tsx:
  - In full-view RSS rows, changed the source label class from chip-like styles (border + background + padding) to a plain amber text label.
  - Preserved uppercase, truncation, and tactical tracking style for scanability.

## Verification
- Ran targeted frontend verification:
  - cd frontend && pnpm run lint
  - cd frontend && pnpm run test
- Result: pass (2 test files, 36 tests, 0 failures).

## Benefits
- Cleaner visual hierarchy in each feed row.
- Less button-like affordance for non-interactive metadata.
- Better alignment with minimalist Intel panel typography.
