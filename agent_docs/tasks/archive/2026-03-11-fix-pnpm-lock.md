# Task: Lockfile Integrity and Project Alignment
**Date: 2026-03-11**

## Issue
- Discrepancy between `pnpm-lock.yaml` (v0.27.0) and `package-lock.json` (v0.23.0).
- `Dockerfile` was using `npm` instead of `pnpm`.
- User reported "weird merge conflict fix" for `dev` branch.

## Solution
- Standardized on `pnpm` for the frontend.
- Removed the outdated `package-lock.json`.
- Updated `Dockerfile` to install `pnpm` and use `pnpm install --frozen-lockfile`.

## Changes
- [DELETE] `frontend/package-lock.json`
- [MODIFY] `frontend/Dockerfile`

## Verification
- Running `docker compose build frontend` to verify lockfile consistency and build success.
- [x] Verified build success with `--frozen-lockfile`.
- [x] Confirmed `pnpm-lock.yaml` is now consistent with `package.json`.
