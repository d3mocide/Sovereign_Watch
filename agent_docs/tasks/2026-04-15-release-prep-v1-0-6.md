# Release Prep v1.0.6

## Issue

The repository had release notes and changelog coverage for the shipped FIRMS and ISS work, but the frontend package version still reported `1.0.5` and the latest FIRMS poller-health visibility work was not reflected in the release metadata. At the same time, the worktree contained unrelated task-log deletions, which made it unsafe to create a git tag or release object directly from the current state.

## Solution

Aligned the package version and release documents to the `v1.0.6` candidate while keeping the release prep scoped to explicit release metadata only. Also documented the latest FIRMS operations visibility work in the changelog and release notes so the release summary matches what is actually shipping.

## Changes

- `frontend/package.json`
  - Bumped the frontend app version from `1.0.5` to `1.0.6`.
- `CHANGELOG.md`
  - Added the FIRMS source-health visibility feature to the `1.0.6` release entry.
  - Added the FIRMS poller blind-spot fix to the `1.0.6` fixed section.
- `RELEASE_NOTES.md`
  - Added FIRMS source-health visibility to key features.
  - Added source-level FIRMS health behavior to bug fixes and technical details.
  - Updated verification text to match the targeted backend API checks and the known host-side `asyncpg` limitation for `space_pulse` pytest.

## Verification

- Release-metadata-only edits after prior targeted verification from this session.
- Confirmed the existing release notes, changelog entry, and frontend package version are now aligned to `v1.0.6`.
- No additional code suites were required for the version/doc-only release prep edits.

## Benefits

- The shipped app version now matches the `v1.0.6` release documents.
- Release notes reflect the full FIRMS scope, including new operational visibility for upstream source drift.
- The release candidate is prepared without accidentally sweeping unrelated task-log deletions into a tag or release object.