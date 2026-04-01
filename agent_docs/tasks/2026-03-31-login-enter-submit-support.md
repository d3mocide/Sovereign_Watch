# 2026-03-31-login-enter-submit-support

## Issue
Pressing Enter on the login screen did not reliably trigger authentication because the inputs were not inside a semantic HTML form submit flow.

## Solution
Converted the login panel fields into a proper `<form>` and wired authentication to the form `onSubmit` handler.

## Changes
- `frontend/src/components/views/LoginView.tsx`
  - Updated submit handler type to `FormEvent<HTMLFormElement>`.
  - Wrapped login inputs and submit button in a `<form onSubmit={handleSubmit}>`.
  - Removed button `onClick` submit wiring, relying on native submit behavior.

## Verification
- `cd frontend && pnpm run lint` passed.
- `cd frontend && pnpm run test` passed (36 tests).

## Benefits
Supports keyboard-first authentication UX: pressing Enter from login fields now submits the form consistently.
