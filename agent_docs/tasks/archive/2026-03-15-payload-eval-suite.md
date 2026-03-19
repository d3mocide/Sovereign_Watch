# 2026-03-15-payload-eval-suite.md

## Issue
Operators required a way to inspect the raw incoming data stream (Protobuf/JSON) for tactical analysis and debugging (Roadmap item **FE-10**). The existing entity inspector lacked syntax highlighting and was visible for static infrastructure where it wasn't applicable.

## Solution
Developed a "god-view" global terminal widget that samples the live data bus and provides real-time pacing controls. Enhanced the individual entity inspector with syntax highlighting and implemented conditional UI logic to hide the raw data button for static infrastructure.

## Changes
- **Frontend**:
    - Created `frontend/src/components/widgets/GlobalTerminalWidget.tsx`: A live streaming terminal with decimation controls (REAL, 2X, 5X, 10X).
    - Modified `frontend/src/components/layouts/SidebarRight.tsx`:
        - Removed `RAW_PAYLOAD` button from `infra` and `repeater` branches.
        - Added conditional rendering for `RAW_PAYLOAD` in the main tracking branch based on `entity.raw` presence.
    - Modified `frontend/src/components/widgets/PayloadInspector.tsx`: Refined the code layout (pre-existing work synced with this release).
    - Modified `frontend/package.json`: Bumped version to `0.32.0`.
- **Documentation**:
    - Updated `CHANGELOG.md` and created `RELEASE_NOTES.md`.
    - Updated `ROADMAP.md` (moved FE-10 to COMPLETED_ARCHIVE.md).

## Verification
- **Visual Check**: Confirmed `GlobalTerminalWidget` renders and updates at various speeds.
- **Hygiene Check**: Confirmed "Raw Payload" button is hidden when selecting a submarine cable or radio repeater.
- **Build Check**: Ran `docker compose build frontend` to ensure no environment regressions.

## Benefits
- Deep operational visibility into the raw data stream.
- Improved UI focus by removing irrelevant action buttons.
- Enhanced developer/analyst experience with syntax highlighting.
