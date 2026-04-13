# Infra UI: CDN and DNS States

## Issue
Map tooltips and right-sidebar detailed views were omitted for the newly added CDN Edge Node (Cloudflare) and DNS Root Server infrastructure categories. Hovering or clicking on these specific entities caused the UI to fall back to generic infrastructure parsing, often displaying mismatched or `"UNKNOWN"` properties.

## Solution
1. **Frontend Parsing logic:** Added handling within `frontend/src/components/map/TacticalMap.tsx` for `DnsRootServer` and `CdnEdgeNode` shapes during hover and click operations. Assayed properties mapped to correct CallSigns and precise Unique Identifiers (`uid`).
2. **Tooltip Views (`MapTooltip.tsx`):** Engineered UI branches for `isDNS` and `isCDN`. Implemented Server and Globe `lucide-react` icons, domain-specific colors (`text-green-400` for DNS, `text-indigo-400` for CDN), and custom property tables (showing explicit parameters like `Latency`, `Reachable`, `IATA`, `Provider`).
3. **Sidebar Views (`InfraView.tsx`):** Extended the detail view component with exhaustive parsing logic identical to the tooltip, including corresponding header states, property lists, edge node tags, and custom visual accents.
4. **Typing Integration (`types.ts`):** Fortified the overarching `InfraProperties` type with DNS & CDN typings (`operator`, `provider`, `ip`, `latency_ms`, `iata`, `reachable`).

## verification
* Linter passed (`pnpm run lint`).
* Rebuild and restart of `infra-poller` was done previously.
* Hover events (`MapTooltip`) and Click actions (`InfraView`) now correctly synthesize UI fragments for DNS and CDN assets.

## Benefits
Accurate visual intelligence for tactical operators regarding global Content Delivery and Domain Name System resilience arrays. Eliminates empty / broken properties on the HUD.
