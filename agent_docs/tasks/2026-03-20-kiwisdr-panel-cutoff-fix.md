# KiwiSDR Panel Bottom Cutoff Fix

## Issue
The bottom section of the KiwiSDR Listening Post panel (containing the audio enable button and waterfall parameters) was getting clipped by bottom taskbars in certain embedded viewing environments. The absolute layout bounding constraints within `App.tsx` mapping to `MainHud.tsx` were causing the terminal to overflow just enough to lose the lowest UI controls underneath the system timeline/dock.

## Solution
Implemented safe bottom padding (`pb-10` and `pb-6`) in the flex containers and footers of the `ListeningPost` and `RadioTerminal` components. 

## Changes
- Modified `frontend/src/components/js8call/ListeningPost.tsx`: increased bottom padding on `.mt-auto` containers (`pb-10` and `pb-4` on the enable button) so they push standard content up above the system-rendered footers.
- Modified `frontend/src/components/js8call/RadioTerminal.tsx`: added similar defensive padding (`pb-6`) to the generic `JS8Call` terminal mode bottom status bar.

## Verification
- Applied changes to React components. The UI should instantly reflect changes via Vite's Hot Module Replacement (HMR).
- Verified `p-6 pb-10` sizing maintains visual aesthetic without overflowing `div flex-1` layout constraints.

## Benefits
- Ensures buttons at the absolute bottom of the SDR UI panels are actually visible and interactable regardless of host system overlays.
