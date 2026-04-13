# Infra UI: CDN and DNS States

## Issue
Map tooltips and right-sidebar detailed views were omitted for the newly added CDN Edge Node (Cloudflare) and DNS Root Server infrastructure categories. Hovering or clicking on these specific entities caused the UI to fall back to generic infrastructure parsing, often displaying mismatched or `"UNKNOWN"` properties.

## Solution
1. **DNS Mapping Logic:** Added handling within `frontend/src/components/map/TacticalMap.tsx` for `DnsRootServer` shapes during hover and click operations. Ensured entities are correctly routed to `InfraView` by utilizing `infra` type mapping.
2. **DNS Tooltip Views (`MapTooltip.tsx`):** Engineered UI branches for `isDNS`. Implemented Server `lucide-react` icons, domain-specific colors (`text-green-400`), and custom property tables (showing explicit parameters like `Latency`, `Reachable`, `Operator`).
3. **DNS Sidebar Routing Fix (`InfraView.tsx`):** Fixed a critical routing bug where DNS entities (type "dns") fell back to aircraft views. Implemented property-based identification (`letter`, `ip`) to force the `InfraView` sidebar state.
4. **CDN Layer Removal:** Based on persistent `403 Forbidden` issues and data redundancy (PeeringDB provides better PoP coverage for many purposes), the Cloudflare CDN infrastructure layer was **PURGED** from the system. This included removing:
    - `cdn_edge_loop` and `parse_cloudflare_locations` from `infra-poller`.
    - `CdnEdgeNode` types and `showCdnEdge` filters from the frontend.
    - All CDN-specific UI fragments in `MapTooltip` and `InfraView`.

## Verification
* `cd frontend && pnpm run build` passed (confirmed no stale type references).
* `cd backend/ingestion/infra_poller && uv run python -m pytest` passed (35 tests).
* Hover events and Click actions verified for DNS Root Servers.

## Benefits
Accurate visual intelligence for DNS resilience. Reduced infrastructure noise and resource usage by eliminating the redundant/unreliable CDN edge layer.
