# 2026-03-12-waterfall-dynamic-range-calibration.md

## Issue
The authentic "SDR Blue" waterfall palette was appearing overly bright and "washed out" with cyan because typical noise floor values from the SDR stream were being mapped to high-intensity colors.

## Solution
1.  **Refined Color Logic**: Adjusted `sdrWaterfallColor` to be more conservative, keeping deep blue shades for a larger range of low-intensity values to represent a natural noise floor.
2.  **WF Baseline Calibration**:
    -   Implemented a `wfOffset` state (defaulting to 60) that is subtracted from incoming pixel data before color mapping.
    -   Added a "WF Baseline (Offset)" slider in the Waterfall Settings sidebar to allow the user to manually tune the floor based on current band conditions or specific SDR nodes.
3.  **HMR Support**: Added `wfOffset` to the render loop's dependency array to ensure immediate visual feedback when adjusting the slider.

## Changes

### Frontend
- [ListeningPost.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/js8call/ListeningPost.tsx): Added `wfOffset` state, updated `sdrWaterfallColor`, and added the UI calibration slider.

## Verification
- **Code Verification**: Verified the subtraction logic in `drawRow` and the updated threshold values in the color function.
- **Manual Verification (Requested)**: User to verify that the waterfall now appears darker by default and can be fine-tuned using the new "WF Baseline" slider.

## Benefits
- Significantly improved visual contrast for signal detection.
- User agency to calibrate the interface for different SDR sources and background noise levels.
