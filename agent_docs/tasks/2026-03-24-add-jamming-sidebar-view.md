Issue: Jamming zones could be hovered for tooltip context but did not support click-to-select with a dedicated right sidebar analysis view.

Solution: Route jamming layer clicks into the existing entity selection pipeline and add a dedicated SidebarRight panel for jamming analysis details.

Changes:
- Updated frontend/src/layers/buildJammingLayer.ts to add onClick selection support for jamming zones and reuse a shared zone-to-entity mapper.
- Updated frontend/src/layers/composition.ts to pass onEntitySelect into buildJammingLayer.
- Added frontend/src/components/layouts/sidebar-right/JammingView.tsx for deep jamming analysis details in the right sidebar.
- Updated frontend/src/components/layouts/SidebarRight.tsx to route entity.type === "jamming" to JammingView.

Verification:
- Ran frontend lint.
- Ran frontend tests.

Benefits:
- Jamming zones now behave like other actionable map layers with click-to-open details.
- Operators can review richer integrity analytics beyond hover tooltips.