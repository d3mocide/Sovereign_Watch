# Linkage Audit Promotion & UI Polish

## Issue
- The Phase 2 Linkage logic remained trapped behind an experimental endpoint (`/test`).
- Diagnostic interfaces lacked streamlined UI entry-points.
- Bounding box extraction in `detect_mission_country` failed on massive landmass regions (e.g. Portland mapped to Canada because the math centers of both countries favor Canada for northern west coast cities).
- The `AIAnalystPanel` header design needed refinement to house engine selection.
- Ghost panels remained open across top-level routing (Map view switching).

## Solution
- **Promotion**: Finalized the 7-Layer Admission Funnel diagnostic tool for GDELT / TAK AI linkage and deployed it persistently at `/linkage`.
- **Cartography Fix**: Short-circuited the Haversine distance computations for North America to map boundaries utilizing a bounding-box override approach that disambiguates the 49th parallel. 
- **Header Badge Swap**: Cleaned out redundant driver logic in the AI panel and placed the Engine selection logic front and center.
- **Routing Intercept**: Fired off state resets to decouple ghost views dynamically in the `App.tsx` state stack. 

## Changes
1. `frontend/src/components/views/LinkageAuditView.tsx`: Rewrote experimental diagnostic view into a production-grade 7-tier admission funnel. Synced defaults with `.env` values (`45.5152`, `-122.6784`, `150`).
2. `frontend/src/components/widgets/SystemStatus.tsx`: Upgraded the top-bar HUD logic to permanently host the `LINKAGE` diagnostic entry-point.
3. `frontend/src/components/views/StatsDashboardView.tsx`: Injected `LINKAGE AUDIT` into the core Dashboard top navigation bar.
4. `backend/api/services/gdelt_linkage.py`: Upgraded `detect_mission_country` to intercept coords between -125/-66 and 24/83 with an explicit 49th parallel delineation. 
5. `frontend/src/components/widgets/AIAnalystPanel.tsx`: Re-organized the header row to house the active `ENGINE` badge.
6. `frontend/src/App.tsx`: Appended a high-level `useEffect` hook listening to `viewMode` switching to flush `setSelectedEntity(null)` and `setIsAIAnalystOpen(false)`.
7. `backend/api/tests/`: Fixed legacy routing test references from `fetch_experimental_linkage_review` to `fetch_linkage_audit`.

## Verification
- Validated routing intercept hot-reloads flush UI sidebar components successfully.
- Ran backend unit test suite (`122 / 122` Passing) tracking the strict NA-boundary logic shift.
- Validated new `/linkage` 7-layer interface maps cleanly under the Portland `.env` scope.

## Benefits
- Analysts now have an embedded, reliable visual admission funnel to inspect why GDELT events map over TAK objects cleanly without touching postgres logs.
- Prevents UI ghosting bugs in tactical rotations.
- Fixes highly visible distance drift resolution issues for Northwest deployments.
