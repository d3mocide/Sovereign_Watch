# 2026-03-12-implement-click-to-tune.md

## Feature
Implemented a "click-to-tune" functionality on the frequency scale in the `ListeningPost` component. Users can now click anywhere on the top frequency scale to tune the SDR to that specific frequency.

## Solution
1.  **Logic**: Added `handleScaleClick` to calculate the frequency offset based on the click position relative to the scale's width and padding.
    -   **WIDE mode**: Maps the 800kHz span (-400 to +400).
    -   **PASSBAND mode**: Maps the 6kHz span (0 to 6).
2.  **UI**: Updated the frequency scale `div` to:
    -   Use `cursor-pointer` for visual feedback.
    -   Capture clicks with `onClick={handleScaleClick}`.
    -   Enable interactions with `pointer-events-auto` and `z-20`.
3.  **Layout Fix**: Ensured the scale is positioned at the very top (`top-0`).

## Changes

### Frontend
- [ListeningPost.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/js8call/ListeningPost.tsx): Added tuning logic and interactive scale overlay.

## Verification
- **Code Verification**: Verified the offset calculation logic (width calculation minus padding, mapping to kHz/Hz spans).
- **Manual Verification (Requested)**: User to verify tuning accuracy in the browser.

## Benefits
- Drastically improves usability by allowing quick "point-and-click" tuning across the wide spectrum.
