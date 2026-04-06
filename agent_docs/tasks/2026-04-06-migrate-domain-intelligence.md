# Domain Intelligence Analyst UX Migration

## Issue
Domain-specific spatial intelligence calls (Air, Sea, Orbital Intelligence) were loosely coupled to an arbitrary H3 spatial context in the map-based `MapContextMenu` (triggered by right-clicking the map). In parallel, the `AIAnalystPanel` (triggered by selecting a specific entity/Cursor-on-Target) already ran these same domain evaluations natively via the backend when resolving the target's uid. This resulted in redundant workflows and often generated vague AI responses when analyzing domains without specific targets.

## Solution
Removed the generic, area-based domain calls from the spatial context menu, isolating this interaction solely to the Analyst Panel. Now, selecting a CoT entity automatically adapts the Analyst Panel's "RUN" button (e.g. `RUN AIR INTEL`) ensuring that Domain Intelligence dynamically fuses with the context of a known, tracked entity.

## Changes
1. **`MapContextMenu.tsx`**: Removed domain intelligence buttons (`Air`, `Sea`, `Orbital`) and the `onAnalyzeDomain` prop handling.
2. **`TacticalMap.tsx` & `OrbitalMap.tsx`**: Removed `onAnalyzeDomain` from prop signatures.
3. **`App.tsx`**: Removed the redundant floating UI component (`domainAnalysisUi`) and routing callbacks since this information will now exclusively render within the Analyst Panel.
4. **`AIAnalystPanel.tsx`**: Injected a dynamic `domainLabel` based on entity type to explicitly reflect which domain (Tactical, Air, Sea, Orbital) is actively targeted by the intelligence execution.
5. **`DashboardView.tsx` & `MiniMap.tsx` & `geoUtils.ts`**: Extracted AOT-intersection logic out of `NWSAlertsWidget.tsx`. Implemented a localized NWS Alert count badge in the Dashboard View's primary metrics banner, and rendered the weather polygons securely onto the Tactical Mini Map (Mapbox vector sources).

## Verification
- Code successfully compiled with zero TypeScript warnings.
- Frontend test suite and linter `pnpm run lint && pnpm run test` returned exit code 0.
- All unused components and interfaces were gracefully deprecated.

## Benefits
- Streamlines the overall map UX, reducing button clutter.
- Ensures domain-intelligence calls incorporate full, tracked, semantic context (origin, destination, vessel classification), vastly improving the fidelity of AI evaluations compared to arbitrary regional bounding boxes.
