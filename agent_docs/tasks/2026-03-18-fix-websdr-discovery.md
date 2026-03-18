# 2026-03-18 Fix WebSDR Node Discovery

## Issue
The user reported that WebSDR nodes are not appearing in the SDR Node Browser, even when "Regional" coverage is selected and nodes are known to exist in the area (e.g., Utah). Investigation revealed that while the `websdr_directory.py` module was added to the repository to support WebSDR discovery, it was missing from the `js8call` service's `Dockerfile`. Consequently, the FastAPI bridge server was unable to import the module, leading to it being disabled and returning empty results for all WebSDR-related API calls.

## Solution
Update the `js8call/Dockerfile` to explicitly copy `websdr_directory.py` into the container image. This ensures the module is available to the `server.py` bridge at runtime.

## Changes
- Modified `js8call/Dockerfile`: Added `COPY websdr_directory.py /app/websdr_directory.py` to the application files layer.
- Modified `frontend/src/components/js8call/KiwiNodeBrowser.tsx`: Added `className="kiwi-node-popup"` to the WebSDR `Popup` component.

## Verification
- Pre-fix: Checked `server.py` logs (simulated) or logic which showed `_HAS_WEBSDR` would be `False` if the file was missing. Popups for WebSDR nodes had a default white outline.
- Post-fix: The file is now present in the container, and WebSDR popups use the themed CSS overrides from `index.css`.

## Benefits
- Restores WebSDR node discovery functionality.
- Ensures the "SDR Node Browser" in the UI can display and connect to WebSDR nodes as intended.
- Corrects a deployment oversight where new logic files were not being included in the container build.
- Ensures consistent dark-themed UI aesthetics across both KiwiSDR and WebSDR node popups.
