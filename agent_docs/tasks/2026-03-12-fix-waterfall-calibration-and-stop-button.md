# 2026-03-12-fix-waterfall-calibration-and-stop-button.md

## Issues
1.  **Calibration Failure**: The `WF Baseline` slider was not updating the waterfall in real-time due to a stale closure bug in the `drawRow` rendering function.
2.  **Visual "Weirdness"**: The "SDR Blue" palette was too aggressive, causing noise to appear as bright cyan/green.
3.  **Missing Control**: No easy way to stop the SDR payload and disconnect the stream.

## Solution

1.  **Real-time Calibration**: Added `wfOffset` to the `useCallback` dependency array for `drawRow`. This ensures that when the user adjusts the baseline slider, the rendering loop is recreated with the latest value, providing instant visual feedback.
2.  **Palette Refinement**: Shifted color thresholds higher to deepen the noise floor. 
    -   **Deep Blue**: Increased range from 40 to 60.
    -   **Signals**: Smoothed the transitions between Cyan, Green, and Red to provide a "heated" look only for actual signal peaks.
3.  **Stop Playback Button**: Added a dedicated **STOP** button next to the waterfall mode controls. This button triggers the `DISCONNECT_KIWI` action, immediately stopping binary ingestion and audio.

## Changes

### Frontend
- [ListeningPost.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/js8call/ListeningPost.tsx): Fixed `drawRow` dependencies, refined `sdrWaterfallColor`, and added the `Stop` button.

## Verification
- **Functionality**: Verified that the `Stop` button correctly triggers the disconnect logic and clears the waterfall.
- **Visuals**: Verified that signals now stand out against a dark blue background and that the `WF Baseline` slider effectively clears noise.

## Benefits
- Responsive and accurate waterfall calibration.
- Improved signal detection via better spectral contrast.
- Single-click controls for stream management.
