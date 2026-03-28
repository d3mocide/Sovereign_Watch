# Project Backbone Infrastructure Layer Integration
## Mapping Open Internet Infrastructure Data Sources to Sovereign Watch

**Date**: March 28, 2026
**Context**: Integrate Project Backbone OSINT research with existing `infra_poller` architecture
**Scope**: 10 internet infrastructure layers (cables, IXPs, DCs, DNS, CDN, fiber, cell towers, satellites, ISS, ground stations)

---

## Executive Summary

Your current `infra_poller` ingests 3 infrastructure layers (submarine cables, internet outages, FCC towers). The Project Backbone research identifies 7 additional high-value open-source layers that can be integrated with **minimal new containers** and **zero commercial licensing costs**.

**Consolidation Strategy: Extend infra_poller with 4 new data sources, defer 3 complex sources to Phase 2**

| Layer | Source | Schedule | Effort | Priority |
|-------|--------|----------|--------|----------|
| **Current** | | | | |
| Submarine Cables | TeleGeography API | 7-day | ~100MB | ✅ Active |
| Internet Outages | IODA API | 30-min | ~60MB | ✅ Active |
| FCC Towers | ULS ZIP | 7-day | ~150MB | ✅ Active |
| **New (Phase 1)** | | | | |
| Internet Exchanges | PeeringDB API | 24-hour | ~20MB | ⭐ High |
| Data Centers | PeeringDB API | 24-hour | ~40MB | ⭐ High |
| Cell Towers | OpenCelliD CSV | 24-hour | ~3.3GB (filtered) | ⭐ High |
| ISS Tracking | Open-Notify API | Real-time (5s) | <1MB | ⭐ High |
| **Phase 2 (Deferred)** | | | | |
| DNS Root Instances | root-servers.org scrape | 24-hour | ~10MB | ▸ Medium |
| CDN Edge Locations | IATA mapping + scrape | 48-hour | ~30MB | ▸ Medium |
| Satellites (Starlink/OneWeb) | CelesTrak JSON | 1-hour | Already in space_pulse | △ Complex |
| Ground Stations | SatNOGS API | 24-hour | ~5MB | △ Complex |
| **Defer/Reject** | | | | |
| Terrestrial Backbone | IXmaps + CAIDA fusion | Custom | Estimated only | ✗ Reject |
| Commercial teleports | FCC + ITU filings | Custom | Paywalled access | ✗ Reject |

---

## Current State: What's Already Implemented

### infra_poller Services

**File**: `/home/user/Sovereign_Watch/backend/ingestion/infra_poller/main.py`

Current loops:
1. **cables_loop()** — 7-day interval
   - Source: submarinecablemap.com/api/v3/
   - Output: Redis (`infra:cables`, `infra:stations`)
   - Memory: ~100 MB

2. **ioda_loop()** — 30-min interval
   - Source: api.ioda.inetintel.cc.gatech.edu/v2/outages/summary
   - Output: Redis (`infra:outages`)
   - Memory: ~60 MB

3. **fcc_loop()** — 7-day interval (hour-gated)
   - Source: data.fcc.gov/download/pub/uls/complete/r_tower.zip
   - Output: PostgreSQL (`infra_towers` table)
   - Memory: ~150 MB

**Total Current Memory**: ~310 MB

---

## Phase 1: New Infrastructure Layers (Add 4 sources)

### 1. Internet Exchanges (PeeringDB IXPs)

**Source**: PeeringDB REST API (free, CC licensed)
**Endpoint**: `https://www.peeringdb.com/api/ix`
**Update Interval**: 24 hours
**Data Volume**: ~900 IXPs globally, ~1 KB each = ~1 MB
**Memory Budget**: ~20 MB

#### Backend Integration (infra_poller)

```python
# New file: backend/ingestion/infra_poller/sources/peeringdb.py

class PeeringDBSource:
    """
    Polls PeeringDB REST API for internet exchanges and colocation facilities.
    """

    BASE_URLS = {
        'ixps': 'https://www.peeringdb.com/api/ix',
        'facilities': 'https://www.peeringdb.com/api/fac',
        'networks': 'https://www.peeringdb.com/api/net'
    }

    async def fetch_ixps(self) -> Optional[list]:
        """Fetch all Internet Exchanges with coordinates."""
        async with aiohttp.ClientSession() as client:
            async with client.get(self.BASE_URLS['ixps']) as resp:
                resp.raise_for_status()
                data = await resp.json()
                return data.get('data', [])

    async def fetch_facilities(self) -> Optional[list]:
        """Fetch all colocation facilities."""
        # Similar pattern to ixps

    async def ingest_ixps(self, ixps: list):
        """Write IXP data to Redis + PostgreSQL."""
        # Redis: cache for frontend queries
        await redis_client.set(
            'infra:peeringdb_ixps',
            json.dumps(ixps),
            ex=86400  # 24-hour TTL
        )

        # PostgreSQL: persistent storage + spatial indexing
        async with db_engine.begin() as conn:
            for ixp in ixps:
                insert_stmt = text("""
                    INSERT INTO peeringdb_ixps (
                        peeringdb_id, name, city, country, geom, asn, members_count
                    ) VALUES (:id, :name, :city, :country,
                              ST_SetSRID(ST_Point(:lon, :lat), 4326),
                              :asn, :members)
                    ON CONFLICT (peeringdb_id) DO UPDATE SET
                        members_count = :members, updated_at = NOW()
                """)

                await conn.execute(insert_stmt, {
                    'id': ixp['id'],
                    'name': ixp['name'],
                    'city': ixp['city'],
                    'country': ixp['country'],
                    'lat': ixp['latitude'],
                    'lon': ixp['longitude'],
                    'asn': ixp.get('asn'),
                    'members': ixp.get('member_count', 0)
                })
```

#### Database Schema

```sql
CREATE TABLE IF NOT EXISTS peeringdb_ixps (
    id              SERIAL PRIMARY KEY,
    peeringdb_id    INTEGER UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    city            TEXT,
    country         TEXT,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    asn             INTEGER,
    members_count   INTEGER DEFAULT 0,
    traffic_level   TEXT,  -- low, mid, high
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX peeringdb_ixps_geom_idx ON peeringdb_ixps USING GIST (geom);
CREATE INDEX peeringdb_ixps_country_idx ON peeringdb_ixps (country);
CREATE INDEX peeringdb_ixps_members_idx ON peeringdb_ixps (members_count DESC);

-- Colocation facilities (data centers)
CREATE TABLE IF NOT EXISTS peeringdb_facilities (
    id              SERIAL PRIMARY KEY,
    peeringdb_id    INTEGER UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    city            TEXT,
    country         TEXT,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    networks_count  INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX peeringdb_facilities_geom_idx ON peeringdb_facilities USING GIST (geom);
CREATE INDEX peeringdb_facilities_country_idx ON peeringdb_facilities (country);
```

#### Frontend Integration

**Layer Type**: ScatterplotLayer + GeoJsonLayer
**Color Encoding**: member_count (0-50 ≈ small gray, 50-200 ≈ blue, 200+ ≈ red)
**Size Encoding**: traffic_level (low ≈ 5px, mid ≈ 10px, high ≈ 15px)
**Hover Tooltip**: IXP name, city, member count, traffic level

```typescript
// frontend/src/layers/buildPeeringDBLayer.ts

export function buildPeeringDBLayer(
  data: PeeringDBIXP[] | null,
  hoveredId: number | null
): Layer[] {
  if (!data) return [];

  return [
    // IXPs as colored scatter points
    new ScatterplotLayer({
      id: 'peeringdb-ixps',
      data,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => {
        if (d.traffic_level === 'high') return 15;
        if (d.traffic_level === 'mid') return 10;
        return 5;
      },
      getFillColor: (d) => {
        const members = d.members_count || 0;
        if (members > 200) return [255, 50, 50, 200];    // Red
        if (members > 50) return [50, 100, 255, 200];    // Blue
        return [150, 150, 150, 150];                      // Gray
      },
      getLineColor: hoveredId === d.id ? [255, 255, 0, 255] : [200, 200, 200, 100],
      getLineWidth: hoveredId === d.id ? 3 : 1,
      radiusScale: 1,
      radiusUnits: 'pixels',
      pickable: true,
    }),
  ];
}
```

---

### 2. Data Centers (PeeringDB Facilities)

**Source**: PeeringDB `/api/fac` endpoint (dual-use with IXPs)
**Update Interval**: 24 hours (same loop as IXPs)
**Data Volume**: ~5,255 facilities globally = ~5 MB
**Memory Budget**: ~40 MB

**Note**: Reuse PeeringDBSource class, add `fetch_facilities()` method. Schema already defined above.

**Frontend Layer**: Similar to IXPs but with different color scheme (data center capacity → network count)

---

### 3. Cell Towers (OpenCelliD)

**Source**: OpenCelliD bulk CSV download (free with API key, CC BY-SA 4.0)
**Endpoint**: `https://www.opencellid.org/downloads.php`
**Update Interval**: 24 hours
**Data Volume**: 40M+ global, but visualization uses ~2.8M (recent/verified)
**Memory Budget**: ~3.3 GB (if loading full dataset), ~100 MB (if filtered)
**Recommended Strategy**: H3 aggregation at resolution 6-7 for rendering

#### Backend Integration

```python
# New file: backend/ingestion/infra_poller/sources/opencellid.py

class OpenCelliDSource:
    """
    Downloads OpenCelliD bulk CSV and ingests filtered cell tower data.
    """

    DOWNLOAD_URL = 'https://www.opencellid.org/downloads.php'

    async def fetch_and_parse_csv(self, api_key: str) -> AsyncGenerator:
        """
        Stream CSV parsing to avoid memory bloat.
        Yields tower records after filtering for:
        - Recent observations (updated > 18 months ago)
        - High confidence (sample count > 10)
        - Valid coordinates
        """

        # Download with streaming
        timeout = aiohttp.ClientTimeout(total=300)  # 5 min timeout
        async with aiohttp.ClientSession(timeout=timeout) as client:
            url = f"{self.DOWNLOAD_URL}?key={api_key}"
            async with client.get(url) as resp:
                resp.raise_for_status()

                # Stream CSV lines
                async for line in resp.content:
                    record = self._parse_csv_line(line)

                    # Filter: confidence, recency, bbox
                    if self._is_valid_tower(record):
                        h3_cell = h3.latlng_to_cell(
                            record['lat'],
                            record['lon'],
                            resolution=6
                        )
                        yield {
                            **record,
                            'h3_res6': h3_cell
                        }

    async def ingest_towers_aggregated(self, towers_stream):
        """
        Aggregate towers by H3 cell (resolution 6-7) to reduce row count.
        Store aggregated counts + centroid geometry.
        """

        aggregated = {}

        async for tower in towers_stream:
            h3_cell = tower['h3_res6']

            if h3_cell not in aggregated:
                aggregated[h3_cell] = {
                    'count': 0,
                    'lat_sum': 0,
                    'lon_sum': 0,
                    'radio_types': set(),
                    'mcc_list': set()
                }

            aggregated[h3_cell]['count'] += 1
            aggregated[h3_cell]['lat_sum'] += tower['lat']
            aggregated[h3_cell]['lon_sum'] += tower['lon']
            aggregated[h3_cell]['radio_types'].add(tower['radio'])
            aggregated[h3_cell]['mcc_list'].add(tower['mcc'])

        # Write aggregated to DB
        async with db_engine.begin() as conn:
            for h3_cell, agg in aggregated.items():
                centroid_lat = agg['lat_sum'] / agg['count']
                centroid_lon = agg['lon_sum'] / agg['count']

                insert_stmt = text("""
                    INSERT INTO opencellid_towers (
                        h3_res6, tower_count, geom, radio_types, countries
                    ) VALUES (
                        :h3, :count, ST_SetSRID(ST_Point(:lon, :lat), 4326),
                        :types, :mccs
                    )
                    ON CONFLICT (h3_res6) DO UPDATE SET
                        tower_count = :count, updated_at = NOW()
                """)

                await conn.execute(insert_stmt, {
                    'h3': h3_cell,
                    'count': agg['count'],
                    'lat': centroid_lat,
                    'lon': centroid_lon,
                    'types': ','.join(agg['radio_types']),
                    'mccs': ','.join(str(m) for m in agg['mcc_list'])
                })
```

#### Database Schema

```sql
CREATE TABLE IF NOT EXISTS opencellid_towers (
    id              SERIAL PRIMARY KEY,
    h3_res6         TEXT UNIQUE NOT NULL,           -- H3 cell ID resolution 6
    tower_count     INTEGER NOT NULL,               -- Towers in this cell
    geom            GEOMETRY(Point, 4326) NOT NULL, -- Centroid
    radio_types     TEXT,                           -- GSM,LTE,UMTS,NR
    countries       TEXT,                           -- MCC list
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX opencellid_geom_idx ON opencellid_towers USING GIST (geom);
CREATE INDEX opencellid_h3_idx ON opencellid_towers (h3_res6);
CREATE INDEX opencellid_count_idx ON opencellid_towers (tower_count DESC);
```

#### Frontend Integration

**Layer Type**: HeatmapLayer (H3 aggregation prevents render bloat)
**Color**: tower_count (0-10 ≈ light blue, 10-100 ≈ cyan, 100+ ≈ red)
**Hover**: Cell ID, tower count, radio types (GSM/LTE/NR), countries

---

### 4. ISS Real-Time Tracking

**Source**: open-notify.org (free, no auth)
**Endpoint**: `http://api.open-notify.org/iss-now.json`
**Update Interval**: 5 seconds (real-time)
**Data Volume**: Single position record (~100 bytes)
**Memory Budget**: <1 MB

#### Backend Integration

```python
# New file: backend/ingestion/infra_poller/sources/iss_tracker.py

class ISSTracker:
    """
    Real-time ISS position tracking via open-notify.org API.
    Updates every 5 seconds, broadcasts via Redis pub/sub.
    """

    ENDPOINT = 'http://api.open-notify.org/iss-now.json'

    async def poll_iss_position(self, redis_client):
        """Poll ISS position and publish to Redis channel."""

        while True:
            try:
                timeout = aiohttp.ClientTimeout(total=10)
                async with aiohttp.ClientSession(timeout=timeout) as client:
                    async with client.get(self.ENDPOINT) as resp:
                        resp.raise_for_status()
                        data = await resp.json()

                        position = {
                            'timestamp': data['timestamp'],
                            'latitude': float(data['iss_position']['latitude']),
                            'longitude': float(data['iss_position']['longitude']),
                            'altitude_km': None,  # Compute from TLE
                            'velocity_ms': None
                        }

                        # Broadcast to WebSocket clients via Redis pub/sub
                        await redis_client.publish(
                            'infrastructure:iss-position',
                            json.dumps(position)
                        )

                        # Cache latest position (1-min TTL)
                        await redis_client.set(
                            'infra:iss_latest',
                            json.dumps(position),
                            ex=60
                        )

                        await asyncio.sleep(5)  # Poll interval

            except Exception as e:
                await redis_client.set(
                    'poller:iss:last_error',
                    json.dumps({
                        'error': str(e),
                        'time': datetime.now().isoformat()
                    }),
                    ex=300
                )
                await asyncio.sleep(10)  # Backoff
```

#### Database Schema (Optional)

```sql
-- Track historical ISS passes (one-per-day summary)
CREATE TABLE IF NOT EXISTS iss_passes (
    id              SERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    max_elevation   FLOAT NOT NULL,                -- Degrees above horizon
    rise_time       TIMESTAMPTZ NOT NULL,
    culmination_time TIMESTAMPTZ NOT NULL,
    set_time        TIMESTAMPTZ NOT NULL,
    rise_azimuth    FLOAT,
    set_azimuth     FLOAT,
    geom            GEOMETRY(Point, 4326),        -- Observer location
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Real-time position archive (5s resolution, rolling 7-day window)
CREATE TABLE IF NOT EXISTS iss_positions (
    time            TIMESTAMPTZ NOT NULL,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    altitude_km     FLOAT,
    velocity_ms     FLOAT
);

SELECT create_hypertable('iss_positions', 'time', if_not_exists => TRUE);
SELECT add_retention_policy('iss_positions', INTERVAL '7 days', if_not_exists => TRUE);
```

#### Frontend Integration

**Layer Type**: PathLayer + IconLayer
**Animation**: Real-time position update via WebSocket (5-6 Hz)
**Trail**: Last 30 minutes of ground track (semi-transparent white path)
**Icon**: ISS chevron (red) at current position
**Hover**: Altitude, velocity, next visible pass time

---

## Summary: Phase 1 Implementation

| Source | Loop | Interval | Memory | Effort | Notes |
|--------|------|----------|--------|--------|-------|
| PeeringDB IXPs | `peeringdb_loop()` | 24h | ~20MB | ~15h | New source module |
| PeeringDB Facilities | (same loop) | 24h | ~40MB | +5h | Reuse IXP loop |
| OpenCelliD Towers | `opencellid_loop()` | 24h | ~100MB | ~20h | H3 aggregation critical |
| ISS Tracker | `iss_tracker_loop()` | 5s | <1MB | ~10h | Real-time WebSocket |
| **Phase 1 Total** | | | **~161MB** | **~50h** | Extend infra_poller |

**Total infra_poller memory**: 310 MB (current) + 161 MB (new) = **471 MB**
**Fits within Jetson Nano budget** ✅

---

## Phase 2: Deferred Sources (Complex Integration)

### DNS Root Instances

**Source**: root-servers.org (scrape) + IANA zone file
**Complexity**: Requires scraping + parsing BIND zone file
**Deferral Reason**: Lower priority, can be implemented after Phase 1 stabilizes
**Estimated Effort**: ~15 hours

### CDN Edge Locations

**Source**: IATA code extraction from HTTP headers + mapping
**Complexity**: Requires network scanning (HTTP HEAD to major CDNs) + IATA database lookup
**Deferral Reason**: Computationally expensive, requires external IATA mapping
**Estimated Effort**: ~25 hours

### Satellite Constellations (Starlink, OneWeb, Kuiper)

**Status**: Already partially implemented in space_pulse
**Action Required**: Extend space_pulse to expose satellite layer data to frontend
**Note**: CelesTrak supplemental data migration to 6-digit catalog IDs needed by July 2026
**Estimated Effort**: ~20 hours (coordinate with space_pulse owner)

### Ground Stations (SatNOGS)

**Source**: SatNOGS Network API
**Integration**: Reuse space_pulse patterns for SatNOGS observations
**Estimated Effort**: ~12 hours

---

## Phase 3 (Future): Commercial/Paywalled

### Reject — Data Sovereignty & Cost

| Source | Reason |
|--------|--------|
| TeleGeography commercial license | $50K+/year, submarine cable capacity data |
| DataCenterMap | Commercial licensing for full global coverage |
| Commercial CDN provider APIs | No structured machine-readable feeds |
| ITU Space Notices | Paywalled, requires bilateral agreement |
| FCC Broadband Map (US-only) | Acceptable for US-specific analysis, low priority |

---

## Database Schema Summary (Phase 1)

```sql
-- NEW TABLES (Phase 1)
CREATE TABLE peeringdb_ixps { id, name, city, country, geom, members_count, ... }
CREATE TABLE peeringdb_facilities { id, name, city, country, geom, networks_count, ... }
CREATE TABLE opencellid_towers { h3_res6, tower_count, geom, radio_types, countries, ... }
CREATE TABLE iss_passes { date, max_elevation, rise_time, culmination_time, set_time, ... }
CREATE TABLE iss_positions (hypertable) { time, geom, altitude_km, velocity_ms, ... }

-- EXISTING TABLES (already in infra_poller)
infra_towers (FCC)
```

---

## API Endpoints (Phase 1)

**New endpoints for frontend**:

```
GET /api/infrastructure/ixps?bbox={bounds}
    → Returns PeeringDB IXPs with member counts, traffic levels

GET /api/infrastructure/facilities?bbox={bounds}
    → Returns colocation facilities (data centers)

GET /api/infrastructure/cell-towers?h3_res=6
    → Returns H3-aggregated cell tower density

GET /api/infrastructure/iss/position
    → Returns current ISS position + next visible passes

WS /ws/infrastructure/iss-stream
    → WebSocket for real-time ISS position updates (5s cadence)
```

---

## Migration Strategy

### Step 1: Extend infra_poller

```bash
# Modify existing files
backend/ingestion/infra_poller/main.py
backend/ingestion/infra_poller/pyproject.toml
backend/db/init.sql

# Add new source modules
backend/ingestion/infra_poller/sources/peeringdb.py
backend/ingestion/infra_poller/sources/opencellid.py
backend/ingestion/infra_poller/sources/iss_tracker.py
```

### Step 2: Update docker-compose.yml

```yaml
sovereign-infra-poller:
  # ... existing config ...
  environment:
    # Existing
    KAFKA_BROKERS: ...
    DATABASE_URL: ...

    # New (Phase 1)
    PEERINGDB_POLL_INTERVAL_SECONDS: 86400      # 24h
    OPENCELLID_API_KEY: ${OPENCELLID_API_KEY}   # .env
    OPENCELLID_POLL_INTERVAL_SECONDS: 86400     # 24h
    ISS_POLL_INTERVAL_SECONDS: 5                # Real-time

  mem_limit: 512m  # Increase from 256m to accommodate Phase 1
```

### Step 3: Frontend Layer Additions

```
frontend/src/layers/buildPeeringDBLayer.ts
frontend/src/layers/buildOpenCelliDLayer.ts
frontend/src/layers/buildISSLayer.ts
frontend/src/components/map/ISSStreamManager.tsx  # WebSocket handler
```

---

## Testing & Verification

### Unit Tests (CLAUDE.md)

```bash
cd backend/ingestion/infra_poller && python -m pytest tests/test_peeringdb.py
cd backend/ingestion/infra_poller && python -m pytest tests/test_opencellid.py
cd backend/ingestion/infra_poller && python -m pytest tests/test_iss_tracker.py
cd frontend && pnpm test -- --testPathPattern="PeeringDB|OpenCelliD|ISS"
```

### Integration Tests

1. **PeeringDB IXP Ingestion**:
   - Poll API, verify ~900 IXPs written to PostgreSQL
   - Verify geom index created correctly
   - Verify Redis cache populated with 24h TTL

2. **OpenCelliD Tower Aggregation**:
   - Download CSV, verify H3 aggregation (2.8M → ~50K H3 cells at res 6)
   - Verify centroid calculation accuracy
   - Verify tower counts by radio type

3. **ISS Real-Time Tracking**:
   - Verify 5s polling cycle doesn't miss updates
   - Verify Redis pub/sub broadcasts position to all subscribed clients
   - Verify 7-day rolling window retention on time-series table

### End-to-End Scenario

1. Load Sovereign Watch tactical map
2. Toggle "Infrastructure" layer group
3. Verify 4 new sublayers appear: IXPs, Data Centers, Cell Towers, ISS
4. Hover over IXP → tooltip shows member count, city
5. Subscribe to ISS WebSocket → position updates every 5s
6. Verify no performance degradation (render time < 16ms on Deck.gl)

---

## Risk & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| OpenCelliD CSV 3.3 GB bloat | High memory pressure | H3 aggregation at res 6 reduces to ~100 MB |
| ISS API downtime (open-notify.org) | Medium | Fallback to cached position, graceful degradation |
| PeeringDB API rate limiting | Low | Not formally enforced, but respect 1 req/sec |
| Jetson Nano memory constrain | Medium | Monitor `docker stats`, enable swap if needed |
| H3 aggregation inaccuracy | Low | Verify centroid calculation with test data |
| Real-time WebSocket scaling | Low | Fan-out via Redis pub/sub, not direct polling from clients |

---

## Effort Estimation (Phase 1)

| Task | Hours | Owner |
|------|-------|-------|
| PeeringDB API integration | 15 | Backend |
| OpenCelliD CSV + H3 aggregation | 20 | Backend |
| ISS real-time tracker | 10 | Backend |
| Database schema (IXPs, facilities, towers, ISS) | 8 | DBA |
| Frontend layers (PeeringDB, OpenCelliD, ISS) | 12 | Frontend |
| WebSocket ISS stream handler | 8 | Frontend |
| Testing (unit + integration) | 10 | QA |
| Documentation + deployment | 5 | DevOps |
| **Total Phase 1** | **~88 hours** | |
| **Timeline** | **4 weeks** | |

---

## Integration with Geospatial Data Layers (Prior Initiative)

This Project Backbone infrastructure layer initiative **complements** the earlier NDBC/ASAM/NOTAM geospatial layer work:

**Synergies**:
- Both extend `infra_poller` (maritime infrastructure + internet infrastructure)
- Both use PostgreSQL + Redis + Deck.gl layers
- Both implement H3-based spatial aggregation
- Both follow async/Kafka patterns

**Sequence**:
1. **Weeks 1–2**: Complete Geospatial Phase 1 (NDBC ocean buoys)
2. **Weeks 3–4**: Geospatial Phase 2 (ASAM maritime threat)
3. **Weeks 5–6**: **Begin Infrastructure Phase 1 (PeeringDB + OpenCelliD + ISS)** in parallel
4. **Weeks 7–8**: Geospatial Phase 3 (Fusion queries) + Infrastructure Phase 1 continuation
5. **Weeks 9–10**: Integration testing of all 7 new data layers

This parallel approach allows different team members to work on infrastructure vs geospatial without blocking.

---

## Conclusion

Project Backbone's internet infrastructure data sources align perfectly with Sovereign Watch's architecture. By consolidating into `infra_poller` and implementing H3 aggregation for large datasets (cell towers), we can add 4 critical layers with **zero new containers**, **~88 hours effort**, and **$0 licensing cost**.

The phased approach (IXPs + Data Centers + Cell Towers + ISS in Phase 1, DNS + CDN + Satellites + Ground Stations in Phase 2) maintains stable deliverables while deferring complex dependencies.

**Recommendation**: Proceed with Phase 1 after Geospatial Phase 1 stabilizes (week 3).

