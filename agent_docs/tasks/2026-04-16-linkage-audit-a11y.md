# Linkage Audit View Form Accessibility

## Issue

The `LinkageAuditView` form inputs lacked explicit `htmlFor` / `id` attribute pairs, failing accessibility linting rules (`jsx-a11y/label-has-associated-control`) and preventing screen readers from associating labels with their controls.

## Solution

Added matching `id` attributes to every controlled input and `htmlFor` attributes to their corresponding labels.

## Changes

| File | Change |
|------|--------|
| `frontend/src/components/views/LinkageAuditView.tsx` | Added `id` and `htmlFor` pairs to all form label/input elements. |

## Verification

- `cd frontend && pnpm run lint` — exit 0 (previously flagged `jsx-a11y` warnings).
- `cd frontend && pnpm run typecheck` — passed.
- `cd frontend && pnpm run test` — all tests passed.

## Benefits

- Screen readers can now correctly associate labels with form controls in the diagnostic view.
- Satisfies `jsx-a11y/label-has-associated-control` for CI lint gate.
