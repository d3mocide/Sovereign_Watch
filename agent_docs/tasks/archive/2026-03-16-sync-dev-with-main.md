# 2026-03-16 - Sync Dev with Main

## Issue
The `dev` branch was lagging behind the `main` branch, missing recent fixes and features (notably RF pulse ingestion updates and palette documentation).

## Solution
Synchronized the local `main` branch with the remote `origin/main` and merged the changes into the `dev` branch.

## Changes
- Performed `git fetch origin main:main` to update the local `main` branch.
- Switched to the `dev` branch (already active).
- Executed `git merge main` which resulted in a fast-forward update.
- Pushed the updated `dev` branch to `origin/dev`.

## Verification
- Git merge completed successfully without conflicts (fast-forward).
- Pushed to remote repository confirmed.
- Verified working directory is clean.

## Benefits
Ensures that all development work proceeds from a state that includes the latest stable improvements from the `main` branch, reducing future merge conflicts.
