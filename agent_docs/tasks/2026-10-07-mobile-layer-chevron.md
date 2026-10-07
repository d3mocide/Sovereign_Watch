# Mobile map-layer chevron

## Issue

The Map Layers header wraps into two rows on mobile. Its header disclosure target covers the first row, while the decorative chevron on the second row has no click handler. Tapping the header works but tapping the visible arrow does not.

## Solution

Give the chevron an independent, accessible disclosure button with a 44-pixel touch target. Preserve the header disclosure and independent quick layer toggles.

## Changes

- `frontend/src/components/widgets/LayerVisibilityControls.tsx`: explicit chevron button with expansion state, action label and click handler, usable in every layer menu.
- `tools/performance/mobile-workspaces.cjs`: directly tap the mobile Tools chevron to expand, collapse and expand again, checking the resulting header state.

## Verification

- Frontend lint and typecheck passed; 316 tests across 35 files passed with host-mounted source in the existing frontend check image (host dependencies unavailable).
- Docker Compose production frontend build passed; frontend recreated and ingress nginx configuration tested/reloaded.
- Production phone Chromium and WebKit checks passed at 390×844 with simulated iPhone safe areas. Checks directly expand/collapse the chevron, visit all Tools tabs, and select the same satellite pass twice; Details opens automatically at full width and clears bottom navigation.
- Production Chromium checks also passed at 320×740, 844×390, 1024×768 and 1440×900. An initial tablet position measurement failed during the combined run; two isolated tablet follow-up runs passed without a source change. The desktop follow-up passed. The helper allows the opening animation to settle before measuring Details.
- Ingress health returned HTTP 200; `git diff --check` passed.

## Benefits

The visible arrow responds directly to touch, mouse and keyboard without requiring users to discover a separate header click target.
