# Documented Task: KiwiSDR Node Filters & Theme
**Date:** 2026-03-10
**Issue:**
The new KiwiSDR map interface was only displaying a maximum of 50 nodes due to a hardcoded limit in the backend API, rendering the "Global" radius toggle ineffective. Additionally, the maplibre popup balloons had excessive white space padding, and the map needed discrete zoom controls that matched the Sovereign Glass theme.

**Solution:**
- Increased the `/api/kiwi/nodes` endpoint limits from 50 to 10000.
- Updated the `KiwiNodeBrowser.tsx` component to dispatch limits derived explicitly from the user's radius toggle (Mission = 50, Regional = 500, Global = 10000) and added these to the `useKiwiNodes` dependency array to trigger active data fetches.
- Integrated the standard MapLibre `NavigationControl` component.
- Extracted necessary CSS class overrides (`.maplibregl-popup-content`, `.maplibregl-ctrl-group`, `.mapboxgl-ctrl-group`) out from the Tailwind `@layer components` scope to prevent Tailwind from purging dynamically-injected map classnames at build time.

**Changes:**
- `js8call/server.py`: Increased default request size bounds.
- `frontend/src/hooks/useKiwiNodes.ts`: Exposed and hooked `limit` state.
- `frontend/src/components/js8call/KiwiNodeBrowser.tsx`: Configured radius presets and mounted `NavigationControl`.
- `frontend/src/index.css`: Added global namespace overrides for map controls.

**Verification:**
Manually verified in the browser that the Global toggle retrieves >1000 nodes, the popups sit flush with the background, and the zoom controls display properly in the slate-900 transparent theme.

**Benefits:**
Complete visual and functional operator control over the global network of JS8/HF receiver stations.
