Issue: GPS SIGINT jamming zones were rendering persistent on-map text labels, which cluttered the tactical view and did not match the existing hover-tooltip interaction pattern used by other layers.

Solution: Remove persistent jamming text labels and route jamming hover events into the shared map tooltip system.

Changes:
- Updated frontend/src/layers/buildJammingLayer.ts to remove the always-visible TextLayer.
- Added hover handlers to jamming pulse/fill layers so hovered zones populate shared hovered-entity state.
- Updated frontend/src/layers/composition.ts to pass tooltip callbacks into buildJammingLayer.
- Updated frontend/src/components/map/MapTooltip.tsx to render a dedicated jamming tooltip panel (assessment, confidence, affected count, integrity metrics, Kp).

Verification:
- Ran frontend lint.
- Ran frontend tests.

Benefits:
- Reduces visual clutter from persistent map labels.
- Aligns jamming UX with existing hover-based layer inspection behavior.
- Keeps rich jamming context available on demand without occupying map space.