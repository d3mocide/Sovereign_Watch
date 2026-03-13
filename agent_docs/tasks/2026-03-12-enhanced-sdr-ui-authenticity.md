# 2026-03-12-enhanced-sdr-ui-authenticity.md

## Feature
Enhanced the `ListeningPost` UI to more closely resemble professional SDR interfaces (like KiwiSDR), focusing on aesthetic authenticity and technical functionality.

## Solution

1.  **Waterfall Palette**: Replaced the "tactical" palette with a professional SDR palette (`sdrWaterfallColor`) utilizing deep blues for the noise floor, teal for moderate signals, and cyan/white for high-intensity signals.
2.  **Expanded Modulation Modes**: Added support for:
    -   `AMN` (Narrow AM)
    -   `SAM` (Synchronous AM)
    -   `CWN` (Narrow CW)
    -   `IQ` (Direct In-phase/Quadrature stream)
3.  **Passband Indicator**: Implemented a dynamic "Green Bar" on the frequency scale overlay.
    -   Calculates width based on the selected mode's bandwidth (e.g., 2.7kHz for USB, 0.5kHz for CW).
    -   Displays at the center of the viewport in `WIDE` mode.
4.  **Refined Mode Grid**: Overhauled the mode selector into a structured 3-column grid with professional emerald/slate styling.

## Changes

### Frontend
- [ListeningPost.tsx](file:///d:/Projects/SovereignWatch/frontend/src/components/js8call/ListeningPost.tsx): Updated constants, color logic, and UI components for the scale and mode selector.

## Verification
- **Code Verification**: Verified the bandwidth mapping in `MODE_INFO` and the percentage-based width calculation for the passband indicator.
- **Manual Verification (Requested)**: User to verify the visual fidelity of the new palette and the responsiveness of the passband indicator when switching modes.

## Benefits
- Professional-grade aesthetic that aligns with industry standards for signal intelligence.
- Improved situational awareness via the passband indicator.
- Support for specializing listening modes beyond basic JS8 frequencies.
