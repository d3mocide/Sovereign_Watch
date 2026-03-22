# Task: Synchronize .cursorrules Directory Map and Context

## Issue

The `.cursorrules` file had an outdated Directory Map that was missing information on the `js8call` service (HF radio terminal) and incorrectly named the `space_pulse` ingestion poller as `orbital_pulse`.

## Solution

1. Updated `.cursorrules` to include the `js8call/` directory and its primary purpose.
2. Synchronized `backend/ingestion/orbital_pulse/` mapping to the correct name: `backend/ingestion/space_pulse/`.
3. Added the corresponding service/container context from `AGENTS.md` for better AI orientation.

## Changes

- Modified `d:\Projects\SovereignWatch\.cursorrules` to update the Directory Map.

## Verification

- Verified directory names against the filesystem.
- Cross-refeferenced with `AGENTS.md` (authoritative source).

## Benefits

- Improved AI navigation through the codebase.
- Clearer project overview for agents working on radio or space/orbital features.
