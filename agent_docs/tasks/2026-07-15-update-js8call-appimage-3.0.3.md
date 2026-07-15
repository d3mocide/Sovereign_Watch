# Update JS8Call-improved AppImage from 2.5.2 to 3.0.3

## Issue

The `sovereign-js8call` image build failed at the JS8Call download layer with
`wget` exit code 8 (server error / 404):

```
target sovereign-js8call: failed to solve: process "/bin/sh -c wget -q -O
/tmp/JS8Call-2.5.2-x86_64.AppImage ..." did not complete successfully: exit code: 8
```

Upstream (`JS8Call-improved/JS8Call-improved`) moved on to v3.0.3 and changed
its release scheme in the process:

- Release tag: `release/2.5.2` → `v3.0.3`
- Linux asset name: `JS8Call-2.5.2-x86_64.AppImage` → `JS8Call-v3.0.3-x86_64.AppImage`
  (note the `v` prefix inside the filename)

The old download URL no longer resolves, so every fresh (uncached) build of the
image fails.

## Solution

Point the Dockerfile at the v3.0.3 release using the new tag/asset naming
scheme, and hoist the version into a build `ARG` (`JS8CALL_VERSION=3.0.3`) so
future bumps are a one-line change (or a `--build-arg` override). The
downloaded file is now staged as `/tmp/JS8Call.AppImage` so the temp filename
no longer embeds the version.

## Changes

- `js8call/Dockerfile`
  - Layer 7 comment updated: it referenced a ".deb package" and claimed 2.5.2
    was latest; now documents the AppImage install and the upstream
    `v<version>` / `JS8Call-v<version>-x86_64.AppImage` naming scheme.
  - Added `ARG JS8CALL_VERSION=3.0.3` and rewrote the `wget` URL to
    `releases/download/v${JS8CALL_VERSION}/JS8Call-v${JS8CALL_VERSION}-x86_64.AppImage`.
  - Extraction, `/usr/bin/js8call` symlink, and the pre-seeded
    `JS8Call - KiwiSDR-Virtual.ini` config are unchanged — the AppImage still
    extracts to `/opt/squashfs-root` and `AppRun` remains the entry point.

## Verification

- Confirmed via the GitHub releases API that the latest release is tagged
  `v3.0.3` and ships `JS8Call-v3.0.3-x86_64.AppImage` (x86_64),
  `JS8Call-v3.0.3-aarch64.AppImage`, a Windows installer, and a macOS dmg.
- Docker daemon is not available in this remote session, so the image build
  itself could not be exercised here. Rebuild locally with
  `make prod` (or `docker compose build sovereign-js8call`) to confirm.
- No Python/JS sources touched, so no lint/test suites apply (targeted
  verification rule).

## Benefits

- Unbreaks the `sovereign-js8call` image build (`make prod`).
- Tracks the current upstream stable release (3.0.3) instead of a deleted
  2.5.2 asset.
- `JS8CALL_VERSION` build arg makes future version bumps trivial and lets
  operators pin a different release without editing the Dockerfile.

## Follow-up risk to watch

JS8Call-improved 3.x is a major-version jump from 2.5.2. The AppImage bundles
its own Qt runtime so the image's system Qt5 packages are unaffected, but the
first container run should be smoke-checked: JS8Call window appearing in Xvfb
(entrypoint STEP 5), UDP API datagrams arriving on port 2242, and the
pre-seeded INI still being honored (config key names could change across a
major release).
