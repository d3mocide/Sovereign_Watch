# Match Actions to Entity Color

## Issue
The CENTER VIEW and TRACK LOG buttons, along with the compass rendering, retained a default green color (`hud-green`) even when other entity types stringently utilize different palettes (e.g., `sea-accent` for maritime vessels). The user requested ensuring these match the entity's color schema.

## Solution
Modified dynamic class handling to ensure robust and dynamic propagation of the `accentBase` color mapping all the way to the compass and sidebar UI action buttons.

## Changes
- `frontend/src/components/layouts/SidebarRight.tsx`:
  - Added dynamic variables (`btnGradient`, `btnBorder`, `btnText`, `btnShadow`) matching the precise color styling needed for each entity block (`isSat`, `isShip`, default air).
  - Applied those styling variables inline cleanly to the CENTER VIEW and TRACK LOG buttons, replacing the hardcoded `hud-green` strings.
- `frontend/src/components/widgets/Compass.tsx`:
  - Migrated dynamic Tailwind interpolations (e.g., `bg-${accentColor}/60` and `border-${accentColor}/40`) to explicit inline `style` objects with derived hexadecimal color/opacity strings (e.g. `${hexColor}66` and `${hexColor}99`) to prevent Tailwind purging dynamic combinations that haven't been configured in the safelist.

## Verification
- Statically validated against Tailwind purging rules and checked hex+opacity interpolations correctly handle the required transparency levels (alpha components).
- Relied on Vite HMR to accurately re-paint the updated inline styles locally inside the frontend container.

## Benefits
- Visual cohesion across different targeted track types.
- Fixed a Tailwind purging edge-case with dynamic string construction in `Compass.tsx`.
