# Mobile menu layout

## Issue

Safe-area handling and map performance improved, but phone menus still reused desktop dimensions and tiny icon controls. Nested fixed-height panels clipped controls, the intelligence header overflowed, and independent menus could overlap.

## Solution

Introduce a labelled mobile Tools menu, coordinated panel dismissal, and independently scrolling sidebar content inside the existing safe viewport. Keep the desktop controls available at the existing wide-screen breakpoint.

## Changes

- `MainHud.tsx`, `MobileNavigationContext.ts`: coordinate Tools and side panels; fixed close headers, scrollable contents, and a dismissible background for mobile popovers.
- `TopBar.tsx`: Tools launcher and labelled action rows; five equal-width view buttons; dismiss overlays on mobile view changes.
- `App.tsx`: settings, health, alerts, account, and terminal menus close each other; opening side panels closes these overlays.
- `GlobalTerminalWidget.tsx`: constrain the raw terminal to the safe viewport and coordinate dismissal with the other menus.
- `SystemHealthWidget.tsx`: portal into the shared safe viewport, matching the other menus; retain its wider desktop presentation.
- `IntelFeed.tsx`, `index.css`: wrap the feed header, reserve touch target space, make panel contents scroll, constrain mobile menus, and prevent narrow headers from overflowing. Text fields use 16px text to avoid iOS focus zoom.
- `TerminatorLayer.tsx`: verification exposed floating-point interpolation producing polar vertices slightly outside valid latitude bounds; assign the exact polar endpoint on both closing ramps.
- `MainHud.test.tsx`, `TerminatorLayer.test.ts`: menu coordination regression and deterministic seasonal geometry coverage.
- `tools/performance/browser-profile.cjs`, `mobile-navigation.cjs`: exercise menu rows, scroll reachability, health dismissal, filter controls, and viewport boundaries.

## Verification

- Docker fallback for unavailable host frontend dependencies: lint and typecheck passed; 303 tests passed in 29 files.
- Chromium phone 390×844 and tablet 1024×768: all five views loaded; tools had non-overlapping rows of at least 44px; Settings and Health remained inside their viewport; panel contents scrolled and menus dismissed.
- WebKit phone 390×844 with simulated 59px top / 34px bottom safe insets: same five-view and menu checks passed.
- Dedicated Chromium interaction checks at 320×740, 844×390, and 1024×768: filter controls and header remained horizontally bounded; Tools, Settings, and the raw terminal reachable; terminal bounds checked. Screenshots under `frontend-mobile-2026-10-07/`.
- Browser fixtures intentionally block remote fonts and tiles. Existing WebKit ResizeObserver notifications occur during map mounts. These checks establish layout behavior, not physical iOS GPU performance.
- Final production Docker build passed. Frontend recreated; nginx configuration validation and graceful reload passed. Proxy `/health`, entry assets, and lazy App bundle all returned HTTP 200; all 14 application services remained running.
- Final dedicated interaction run passed for all three viewport sizes, including terminal sizing and dismissal. The backdrop test targets an exposed corner, because the terminal correctly covers the middle of its backdrop.

## Benefits

Mobile navigation no longer depends on discovering icons in a horizontally clipped desktop toolbar. Filters and feeds remain reachable by scrolling, while a fixed close control makes panels easy to dismiss. Desktop mapping and prior safe-area handling remain available.
