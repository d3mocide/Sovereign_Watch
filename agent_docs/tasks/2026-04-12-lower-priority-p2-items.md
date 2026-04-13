# Lower Priority P2 Items

**Date:** 2026-04-12
**Branch:** `claude/lower-priority-p2-items-FzkOy`

## Issue

Several P2 backlog items remained open after the GDELT Phase 2 and OpenAIP airspace work
shipped in v1.0.4.  Space-05 (satellite constellations) turned out to already be complete.
Ingest-07 (Drone Remote ID) was deferred to a future SDR-mode milestone.  The remaining
items — Infra-06, Infra-07, and Analyt-02 — were implemented in this session.

## Solution

### Infra-06 — DNS Root Server Health (infra poller)
Added `dns_root_loop` to `InfraPollerService`.  Every 5 minutes it probes all 13 IANA root
DNS server clusters (A–M) using a raw UDP DNS query (no new dependencies required).
Results — letter, operator, IP, lat/lon, reachability, RTT latency — are stored under
`dns:root:health` in Redis with a 6-minute TTL.

### Infra-07 — CDN Edge Nodes (infra poller)
Added `cdn_edge_loop` to `InfraPollerService`.  Every 6 hours it fetches Cloudflare's
public `speed.cloudflare.com/locations` JSON, normalises the PoP entries (iata, city,
country, lat/lon), and stores the result under `cdn:edge:nodes` in Redis with a 6h+10min
TTL.

### Analyt-02 — Mission-Scoped Stats (API)
Added two new endpoints to `backend/api/routers/stats.py`:
- `GET /api/stats/mission/activity` — 1-minute tumbling-window activity timeline filtered
  by active mission `ST_DWithin` circle (lat/lon/radius_nm from `mission:active` Redis key).
- `GET /api/stats/mission/tak-breakdown` — COT entity breakdown filtered the same way.

Both endpoints fall back to global (un-filtered) queries when no active mission is set, and
include `mission_scoped` and `mission` fields in the response for client transparency.

### Space-05 — Satellite Constellations (no change needed)
Confirmed already complete: `starlink`, `oneweb`, and `iridium-NEXT` have been in the
orbital source's `groups` list since initial implementation, with full
`GROUP_CONSTELLATION_MAP` entries.  Kuiper has no public CelesTrak TLEs yet.

### Ingest-07 — Drone Remote ID (deferred)
Requires SDR hardware integration (OpenDroneID / FAA Remote ID).  Moved to a future
SDR-mode milestone in the roadmap.

## Changes

| File | Change |
|------|--------|
| `backend/ingestion/infra_poller/main.py` | Added `socket`, `struct` imports; `DNS_ROOT_SERVERS` data, `POLL_INTERVAL_DNS_ROOT_MINUTES`, `POLL_INTERVAL_CDN_HOURS`, `CDN_CLOUDFLARE_LOCATIONS_URL` constants; `_probe_dns_sync()` and `parse_cloudflare_locations()` pure helpers; `dns_root_loop`, `_fetch_dns_root_health`, `cdn_edge_loop`, `_fetch_cdn_edge_nodes` methods on `InfraPollerService`; registered both loops in `run()` |
| `backend/api/routers/infra.py` | Added `GET /api/infra/dns-root` and `GET /api/infra/cdn-nodes` endpoints |
| `backend/api/routers/stats.py` | Added `import json`; `_get_active_mission()` helper; `GET /api/stats/mission/activity` and `GET /api/stats/mission/tak-breakdown` endpoints |
| `backend/ingestion/infra_poller/tests/test_infra.py` | Added 13 new tests covering `DNS_ROOT_SERVERS` static data, `_probe_dns_sync` (mocked socket), and `parse_cloudflare_locations` |
| `ROADMAP.md` | Marked Geo-04, FE-43, Space-05, Infra-06, Infra-07, Analyt-02 as done; Ingest-07 as deferred |

## Verification

```
cd backend/ingestion/infra_poller
uv tool run ruff check .   # all checks passed
uv run python -m pytest tests/test_infra.py -v  # 40/40 passed

cd backend/api
uv tool run ruff check routers/infra.py routers/stats.py  # all checks passed
```

## Benefits

- **Infra-06**: Operators can now visualise global DNS root server health and RTT on the
  map, enabling early detection of BGP hijacks or root server degradation events.
- **Infra-07**: Cloudflare PoP locations provide a CDN edge topology overlay — useful for
  correlating traffic anomalies with specific edge regions.
- **Analyt-02**: Mission-scoped activity and TAK breakdown give operators per-AOR statistics
  without polluting the global dashboard numbers.
