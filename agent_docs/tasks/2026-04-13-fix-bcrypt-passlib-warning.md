## Issue
Backend login emitted a warning from Passlib when loading bcrypt:
`AttributeError: module 'bcrypt' has no attribute '__about__'`.

## Solution
Pinned `bcrypt` to a Passlib 1.7.4-compatible version (`4.0.1`) in the backend API dependency list, then refreshed the lockfile.

## Changes
- Updated `backend/api/pyproject.toml`
  - Changed `bcrypt==4.2.1` to `bcrypt==4.0.1`
  - Added a short compatibility comment explaining the Passlib metadata expectation.
- Updated `backend/api/uv.lock`
  - Resolved and locked dependency graph with bcrypt downgraded to `4.0.1`.

## Verification
- Ran: `cd backend/api && uv tool run ruff check . && uv run python -m pytest`
- Result:
  - Ruff: `All checks passed!`
  - Pytest: `135 passed`.

## Benefits
- Removes noisy authentication warning during login.
- Keeps password hashing behavior stable with current Passlib version.
- Produces cleaner backend logs and clearer operational signal for real issues.
