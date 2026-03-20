# 2026-03-20 - Fix FCC Tower Tooltip + Sidebar Mapping

## Issue
FCC towers were rendering on the map, but interaction payloads were normalized as generic undersea infrastructure. This caused tower tooltip/sidebar details to show submarine cable fields and cyan infra styling instead of FCC tower metadata and color cues.

## Solution
Added a dedicated tower interaction path from deck.gl layer picks through TacticalMap entity mapping into tooltip/sidebar rendering. Preserved undersea/outage behavior while introducing tower-specific UI branching and orange accent treatment.

## Changes
- Updated frontend/src/layers/buildTowerLayer.ts:
  - Normalized hover/click pick info to a tower-shaped object with `type: "tower"`, Point geometry, and explicit tower properties (`fcc_id`, `owner`, `status`, `height_m`, etc.).
- Updated frontend/src/components/map/TacticalMap.tsx:
  - Hover mapper now detects tower entities and assigns `entity.type = "tower"`.
  - Selection mapper now preserves tower type for right-sidebar rendering.
  - Tooltip clear logic now clears tower hovers as infrastructure-derived entities.
- Updated frontend/src/components/map/MapTooltip.tsx:
  - Added tower branch with orange styling and FCC-specific fields.
  - Updated header status tag to display `TOWER` for FCC entities.
- Updated frontend/src/components/layouts/SidebarRight.tsx:
  - Added dedicated tower right-sidebar branch with FCC metadata sections, center control, and source attribution.
  - Extended infra property typing to include tower fields.

## Verification
- Ran targeted diagnostics on changed frontend files via VS Code error checking.
- Ran frontend quality gates once:
  - `npm run lint`
  - `npm run test`

## Benefits
- FCC towers now present correct metadata in hover tooltip and right-side detail panel.
- Visual semantics are restored: tower UI uses a distinct orange identity instead of submarine cable cyan.
- Maintains existing undersea cable, landing station, repeater, and outage behavior while improving type separation for future infra subtypes.
