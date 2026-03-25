Issue: Backend jamming analysis events were being generated, but GPS integrity zones were not appearing on the map because the frontend never defaulted showJamming on and did not expose a normal UI toggle for that layer.

Solution: Add showJamming to the persisted tactical and orbital filter defaults and expose explicit GPS integrity zone toggles in the tactical environmental controls and orbital quick toggles.

Changes:
- Updated frontend/src/App.tsx to include showJamming in tactical and orbital default filter state.
- Updated frontend/src/types.ts so MapFilters explicitly includes showJamming.
- Updated frontend/src/components/widgets/LayerVisibilityControls.tsx to surface a GPS Integrity Zones toggle and make the environmental group respect either Aurora or jamming visibility.
- Updated frontend/src/components/widgets/OrbitalCategoryPills.tsx to expose a GPS Integrity Zones quick toggle in orbital view.

Verification:
- Ran frontend lint.
- Ran frontend tests.

Benefits:
- Active backend jamming detections can render on the map without hidden state.
- Operators can now intentionally toggle GPS integrity zones on and off from the normal UI in both tactical and orbital views.