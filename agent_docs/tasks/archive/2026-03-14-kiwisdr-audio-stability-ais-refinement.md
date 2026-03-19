# 2026-03-14 KiwiSDR Audio Stability and AIS Identification Refinement

## Issue
1. **KiwiSDR Persistence**: Audio would continue playing after stopping the station due to leaked backend processes and lack of frontend silence detection.
2. **KiwiSDR Restart**: Audio would fail to restart after a stop or refresh due to an infinite loop in the `useListenAudio` hook and over-aggressive `AudioContext` suspension.
3. **AIS Identification**: The registration field for ships repeatedly displayed the IMO number, which was redundant and less useful than the radio callsign for identification.

## Solution
1. **Robust Cleanup**: The backend `DISCONNECT_KIWI` handler now explicitly closes all binary streams and terminates the `pacat` bridge process.
2. **Infinite Loop Fix**: Removed the `isPlaying` dependency from the `useListenAudio` connection effect.
3. **Functional State Updates**: Migrated the audio watchdog to use functional state updates to avoid closure/dependency issues.
4. **Resilient AudioContext**: The `AudioContext` is no longer proactively suspended on every connection drop, allowing for faster and more reliable restarts.
5. **Callsign Prioritization**: Updated `SidebarRight.tsx` to prioritize the vessel callsign in the registration field.

## Changes
- [MODIFY] [js8call/server.py](file:///d:/Projects/SovereignWatch/js8call/server.py): Implemented process and socket cleanup.
- [MODIFY] [useListenAudio.ts](file:///d:/Projects/SovereignWatch/frontend/src/hooks/useListenAudio.ts): Fixed infinite loop and suspension logic.
- [MODIFY] [ListeningPost.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/js8call/ListeningPost.tsx): Added stopping state UI feedback.
- [MODIFY] [SidebarRight.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/layouts/SidebarRight.tsx): Updated ship registration field logic.
- [MODIFY] [CHANGELOG.md](file:///d:/Projects/SovereignWatch/CHANGELOG.md) & [RELEASE_NOTES.md](file:///d:/Projects/SovereignWatch/RELEASE_NOTES.md): Documented all changes for v0.28.4.

## Verification
- Verified audio stops immediately on "Stop" and releases the system audio sink.
- Verified audio restarts reliably after stopping or refreshing the page.
- Verified ship registration correctly displays callsigns (e.g., "V7JJ2") in the right sidebar.
- Verified that v0.28.4 includes all recent optimizations and bug fixes.

## Benefits
- Improved system stability and eliminated audio resource leaks.
- More reliable user experience when monitoring KiwiSDR nodes.
- Enhanced tactical awareness for maritime entities.
- Comprehensive documentation of all fixes in the current release.
