# Release Notes - Sovereign Watch v0.10.1

## UDP Bridge & Stability Hotfix

Version 0.10.1 introduces a critical stability hotfix for the JS8Call tactical bridge.

### Fixed

- **JS8Call Headless Qt Thread Crash:** Completely bypassed a fatal Qt `QNativeSocketEngine` threading violation that crashed the headless JS8Call instance when the API attempted to establish a TCP socket over Xvfb. Re-engineered the bridge server to parse native UDP JSON telemetry from JS8Call's broadcasting API, resulting in a flawless, connectionless integration that restores live frequency and station metadata to the HUD.

### Upgrade Instructions
1. Run `git pull origin main` to fetch the latest changes.
2. Run `docker compose up -d --build js8call` to apply the UDP bridge patches.