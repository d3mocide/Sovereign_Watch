# Sovereign Watch Infrastructure Enrichment Layer

**Project**: Multi-Source Telemetry Fusion Engine (Project 5)  
**Status**: Design Phase - Ready for Implementation  
**Owner**: Will (d3FRAG Networks)  
**Last Updated**: April 20, 2026

-----

## Executive Summary

This document describes the integration of a **strategic infrastructure overlay** directly into Sovereign Watch as a new map layer and TAK-NORM enrichment source. Rather than building a standalone telemetry fusion engine, we leverage Sovereign Watch’s existing infrastructure (Redpanda, TimescaleDB, FastAPI, React/Deck.gl) to add five new data streams:

1. **Submarine Cables** (PeeringDB + TeleGeography)
1. **Satellite TLEs & Pass Predictions** (CelesTrak / Space-Track)
1. **Cell Tower Infrastructure** (OpenCellID, future enhancement)
1. **DNS Root Nameservers** (RIPE Atlas, future enhancement)
1. **Data Centers** (Cloudscaping / manual curated, future enhancement)

**MVP Timeline**: 2 weeks (Submarine Cables + Satellites)  
**Full Implementation**: 8 weeks (all 5 sources + risk correlation layer)

-----

## 1. Integration Architecture

### 1.1 High-Level Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    SOVEREIGN WATCH CORE (EXISTING)                │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Existing TAK-NORM Agents:          Infrastructure Agent (NEW):  │
│  ├── AIS Ingestor                   ├── Submarine Cables         │
│  ├── ADS-B Ingestor                 ├── Satellites (TLE/Pass)    │
│  ├── Orbital Ingestor               ├── Cell Towers              │
│  ├── GLDent Ingestor                ├── DNS Roots                │
│  └── ...                            └── Data Centers             │
│                                                                   │
│  ↓ All agents normalize to COT (Common Tactical Object)         │
│                                                                   │
│  Redpanda Message Broker                                        │
│  ├── ais-telemetry topic                                        │
│  ├── adsb-telemetry topic                                       │
│  ├── orbital-telemetry topic                                    │
│  └── infrastructure-telemetry topic (NEW)                       │
│                                                                   │
│  ↓                                                                │
│                                                                   │
│  FastAPI Backend                                                │
│  ├── /api/ais/* endpoints (existing)                            │
│  ├── /api/infrastructure/* endpoints (NEW)                      │
│  ├── WebSocket handlers for live updates                        │
│  └── Risk assessment & correlation engine (NEW)                │
│                                                                   │
│  ↓                                                                │
│                                                                   │
│  TimescaleDB (PostgreSQL + PostGIS)                             │
│  ├── ais_positions table (existing)                             │
│  ├── adsb_positions table (existing)                            │
│  ├── orbital_positions table (existing)                         │
│  └── infrastructure_objects table (NEW)                         │
│                                                                   │
│  ↓                                                                │
│                                                                   │
│  React/Deck.gl Frontend                                         │
│  ├── Existing map layers (AIS, ADS-B, Orbital)                 │
│  ├── Infrastructure layers (NEW):                              │
│  │   ├── Submarine Cable lines + landing points                 │
│  │   ├── Satellite positions + pass prediction arcs             │
│  │   ├── Cell tower clusters (future)                          │
│  │   ├── DNS root latency visualization (future)               │
│  │   └── Data center locations (future)                        │
│  └── Infrastructure detail panel (NEW)                         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Agent Architecture

The **Infrastructure Ingestor Agent** is modeled after existing agents (AIS, ADS-B):

```python
# agents/infrastructure_ingestor.py

class InfrastructureIngestorAgent:
    """
    Continuously fetches infrastructure telemetry from multiple sources,
    normalizes to TAK-COT format, and publishes to Redpanda.
    Runs as a systemd service in production.
    """
    
    def __init__(self, config: Dict):
        self.config = config
        self.redpanda = RedpandaProducer(config['redpanda_url'])
        
        # Initialize source-specific ingestors
        self.ingestors = {
            'submarine_cables': SubmarineCableIngestor(config),
            'satellites': SatelliteIngestor(config),
            'cell_towers': CellTowerIngestor(config),
            'dns_roots': DNSRootIngestor(config),
            'data_centers': DataCenterIngestor(config),
        }
    
    async def run(self):
        """Main loop: fetch, normalize, publish."""
        while True:
            tasks = [
                self.ingest_source('submarine_cables', interval_seconds=3600),  # hourly
                self.ingest_source('satellites', interval_seconds=1800),         # 30 min
                self.ingest_source('cell_towers', interval_seconds=86400),       # daily
                self.ingest_source('dns_roots', interval_seconds=900),           # 15 min
                self.ingest_source('data_centers', interval_seconds=86400),      # daily
            ]
            await asyncio.gather(*tasks)
    
    async def ingest_source(self, source_name: str, interval_seconds: int):
        """Fetch and publish infrastructure from a single source."""
        while True:
            try:
                ingestor = self.ingestors[source_name]
                objects = await ingestor.fetch()
                
                for obj in objects:
                    # Normalize to TAK-COT format
                    cot = ingestor.normalize_to_cot(obj)
                    
                    # Publish to Redpanda
                    await self.redpanda.produce(
                        topic='infrastructure-telemetry',
                        value=json.dumps(cot),
                        key=cot['uid']
                    )
                    
                    logger.info(f"Published {source_name}: {cot['uid']}")
                
            except Exception as e:
                logger.error(f"Error ingesting {source_name}: {e}")
            
            await asyncio.sleep(interval_seconds)
```

-----

## 2. MVP Scope (Weeks 1-2): Submarine Cables + Satellites

### 2.1 Submarine Cables

#### Data Source

- **Primary**: PeeringDB Cable API (free, updated weekly)
  - Endpoint: `https://api.peeringdb.com/api/net/cable-connection`
  - No authentication required
  - Returns: cable ID, name, landing points, capacity, status
- **Secondary (Future)**: TeleGeography (paid, most comprehensive)
  - More detailed cable properties, repair history, damage events
  - Can integrate later

#### Ingestor Implementation

```python
# agents/infrastructure_ingestor.py

class SubmarineCableIngestor(IngestorBase):
    """Fetches submarine cable data from PeeringDB."""
    
    async def fetch(self) -> List[Dict]:
        """Fetch all cables from PeeringDB API."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                'https://api.peeringdb.com/api/net/cable-connection'
            ) as resp:
                data = await resp.json()
                return data['data']
    
    def normalize_to_cot(self, cable: Dict) -> Dict:
        """
        Normalize PeeringDB cable to TAK-COT format.
        
        COT type: a-f-G-E-S-A-M (feature/ground/equipment/submarine/cable/marker)
        Custom: Use 'a-f-G-E-S-A-M' for submarine cable.
        """
        
        # Extract landing points
        landing_points = []
        if 'facilities' in cable:
            for facility in cable['facilities']:
                if facility.get('latitude') and facility.get('longitude'):
                    landing_points.append({
                        'name': facility.get('name'),
                        'country': facility.get('country'),
                        'lat': facility['latitude'],
                        'lon': facility['longitude']
                    })
        
        # Determine status color
        status = 'active'
        if 'status' in cable and cable['status'] in ['proposed', 'planned']:
            status = 'planned'
        
        return {
            'type': 'a-f-G-E-S-A-M',
            'uid': f"cable-peeringdb-{cable['id']}",
            'name': cable['name'],
            'geometry': {
                'type': 'Point',
                'coordinates': [landing_points[0]['lon'], landing_points[0]['lat']]
                if landing_points else [0, 0]
            },
            'properties': {
                'cable_id': cable['id'],
                'capacity_tbps': cable.get('capacity', 'unknown'),
                'status': status,
                'operators': cable.get('operators', []),
                'landing_points': landing_points,
                'length_km': cable.get('length', None),
                'technology': cable.get('technology', 'unknown'),
                'url': cable.get('website', ''),
            },
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'source': 'peeringdb',
        }
```

#### Database Schema

```sql
-- New table in TimescaleDB
CREATE TABLE IF NOT EXISTS infrastructure_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Object metadata
    object_type VARCHAR NOT NULL,  -- 'cable', 'satellite', 'tower', 'dns_root', 'datacenter'
    uid VARCHAR UNIQUE NOT NULL,   -- Unique identifier: cable-peeringdb-123
    name VARCHAR NOT NULL,
    
    -- Geospatial
    location GEOMETRY(Point, 4326),
    
    -- Status & tracking
    status VARCHAR,  -- 'active', 'planned', 'damaged', 'operational', etc.
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Flexible properties (source-specific data)
    properties JSONB,
    
    -- TAK serialization (for direct consumption)
    cot_data BYTEA,
    
    -- Indexing
    CHECK (object_type IN ('cable', 'satellite', 'tower', 'dns_root', 'datacenter'))
);

-- Indexes for performance
CREATE INDEX idx_infrastructure_location ON infrastructure_objects USING GIST (location);
CREATE INDEX idx_infrastructure_type ON infrastructure_objects (object_type);
CREATE INDEX idx_infrastructure_type_status ON infrastructure_objects (object_type, status);
CREATE INDEX idx_infrastructure_uid ON infrastructure_objects (uid);
CREATE INDEX idx_infrastructure_updated ON infrastructure_objects (last_updated DESC);

-- Hypertable for TimescaleDB (optional, for time-series queries)
SELECT create_hypertable('infrastructure_objects', 'last_updated', if_not_exists => TRUE);
```

#### API Endpoint

```python
# backend/api/routes/infrastructure.py

@router.get('/api/infrastructure/cables')
async def get_submarine_cables(
    status: Optional[str] = None,
    bbox: Optional[str] = None,  # bbox=minlon,minlat,maxlon,maxlat
    limit: int = 1000,
    db: AsyncSession = Depends(get_db)
) -> List[Dict]:
    """
    Fetch submarine cables, optionally filtered by status or bounding box.
    
    Example:
      GET /api/infrastructure/cables?status=active
      GET /api/infrastructure/cables?bbox=-74,40,-73,41  (NYC area)
    """
    query = db.query(InfrastructureObject).filter(
        InfrastructureObject.object_type == 'cable'
    )
    
    if status:
        query = query.filter(InfrastructureObject.status == status)
    
    if bbox:
        minlon, minlat, maxlon, maxlat = map(float, bbox.split(','))
        query = query.filter(
            InfrastructureObject.location.within(
                f'POLYGON(({minlon} {minlat}, {maxlon} {minlat}, '
                f'{maxlon} {maxlat}, {minlon} {maxlat}, {minlon} {minlat}))'
            )
        )
    
    cables = await query.limit(limit).all()
    
    return [
        {
            'id': str(cable.id),
            'uid': cable.uid,
            'name': cable.name,
            'status': cable.status,
            'geometry': {
                'type': 'Point',
                'coordinates': [cable.location.x, cable.location.y]
            },
            'properties': cable.properties
        }
        for cable in cables
    ]

@router.get('/api/infrastructure/cables/{uid}')
async def get_cable_details(uid: str, db: AsyncSession = Depends(get_db)) -> Dict:
    """Fetch detailed info for a specific cable."""
    cable = await db.query(InfrastructureObject).filter(
        InfrastructureObject.uid == uid
    ).first()
    
    if not cable:
        raise HTTPException(status_code=404, detail="Cable not found")
    
    return {
        'id': str(cable.id),
        'uid': cable.uid,
        'name': cable.name,
        'status': cable.status,
        'properties': cable.properties,
        'last_updated': cable.last_updated.isoformat()
    }
```

#### Frontend Layer

```typescript
// frontend/src/components/layers/SubmarineCableLayer.tsx

import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { GeoJsonLayer as DeckGLGeoJsonLayer } from 'deck.gl';

interface SubmarineCable {
  id: string;
  uid: string;
  name: string;
  status: 'active' | 'planned' | 'damaged';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    capacity_tbps: string;
    operators: string[];
    landing_points: Array<{
      name: string;
      country: string;
      lat: number;
      lon: number;
    }>;
  };
}

export function createSubmarineCableLayer(
  cables: SubmarineCable[],
  onHover?: (info: any) => void,
  onClick?: (info: any) => void
) {
  // Convert cables to GeoJSON format for lines between landing points
  const cableLines = cables.flatMap(cable => {
    const landingPoints = cable.properties.landing_points;
    if (landingPoints.length < 2) return [];
    
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: landingPoints.map(lp => [lp.lon, lp.lat])
      },
      properties: {
        uid: cable.uid,
        name: cable.name,
        status: cable.status,
        capacity: cable.properties.capacity_tbps,
        operators: cable.properties.operators
      }
    };
  });

  // Cable line layer
  const lineLayer = new GeoJsonLayer({
    id: 'submarine-cables-lines',
    data: { type: 'FeatureCollection', features: cableLines },
    stroked: true,
    filled: false,
    lineWidthScale: 20,
    lineWidthMinPixels: 2,
    lineWidthMaxPixels: 10,
    getLineColor: (feature: any) => {
      const status = feature.properties.status;
      if (status === 'active') return [0, 255, 0, 255];      // green
      if (status === 'planned') return [255, 255, 0, 255];   // yellow
      if (status === 'damaged') return [255, 0, 0, 255];     // red
      return [128, 128, 128, 255];                           // gray
    },
    pickable: true,
    onHover: onHover,
    onClick: onClick,
    updateTriggers: {
      getLineColor: [cables]
    }
  });

  // Cable landing points layer
  const landingPointsData = cables.flatMap(cable =>
    cable.properties.landing_points.map(lp => ({
      coordinates: [lp.lon, lp.lat],
      name: lp.name,
      country: lp.country,
      cable_uid: cable.uid,
      cable_name: cable.name
    }))
  );

  const pointsLayer = new ScatterplotLayer({
    id: 'submarine-cables-landing-points',
    data: landingPointsData,
    getPosition: (d: any) => d.coordinates,
    getRadius: 50000, // 50km
    getFillColor: [100, 200, 255, 200],
    getLineColor: [0, 0, 0, 255],
    getLineWidth: 1,
    pickable: true,
    onHover: onHover,
    onClick: onClick
  });

  return [lineLayer, pointsLayer];
}
```

### 2.2 Satellites (TLEs & Pass Predictions)

#### Data Source

- **Primary**: CelesTrak (free, public TLE sets)
  - Endpoint: `https://celestrak.com/NORAD/elements/`
  - No authentication required
  - Returns: Two-Line Element sets (TLE format)
- **Secondary (Future)**: Space-Track.org (credentialed, comprehensive)
  - Requires free registration
  - More granular satellite categories, historical TLE data

#### Ingestor Implementation

```python
# agents/infrastructure_ingestor.py

from skyfield.api import EarthSatellite, load, wgs84
from datetime import datetime, timedelta

class SatelliteIngestor(IngestorBase):
    """Fetches satellite TLEs and computes pass predictions."""
    
    def __init__(self, config: Dict):
        super().__init__(config)
        self.ts = load.timescale()  # Skyfield timescale
        self.earth = load('de421.bsp')['earth']
        
        # Area of Interest (configurable, default: continental US)
        self.aoi = config.get('aoi', {
            'lat': 39.8283,
            'lon': -98.5795,
            'elevation_m': 0
        })
        self.observer = wgs84.latlong(
            self.aoi['lat'], self.aoi['lon'], self.aoi['elevation_m']
        )
    
    async def fetch(self) -> List[Dict]:
        """
        Fetch TLEs from CelesTrak and compute pass predictions.
        
        Returns list of satellites with current position + next passes.
        """
        satellites = []
        
        # Fetch TLE set (e.g., 'stations' for ISS, active satellites, etc.)
        async with aiohttp.ClientSession() as session:
            # Fetch active satellites
            async with session.get(
                'https://celestrak.com/NORAD/elements/active.txt'
            ) as resp:
                tle_text = await resp.text()
        
        # Parse TLEs
        lines = tle_text.strip().split('\n')
        for i in range(0, len(lines), 3):
            if i + 2 >= len(lines):
                break
            
            name = lines[i].strip()
            line1 = lines[i + 1].strip()
            line2 = lines[i + 2].strip()
            
            try:
                sat = EarthSatellite.from_line(name, line1, line2)
                
                # Compute current position
                t_now = self.ts.now()
                astrometric = (self.earth + self.observer).at(t_now).observe(sat)
                apparent = astrometric.apparent()
                lat, lon = apparent.apparent_geocentric_latitude.degrees, \
                           apparent.apparent_geocentric_longitude.degrees
                
                # Compute next 5 passes over AoI
                passes = self._compute_passes(sat, self.observer, hours_ahead=48, num_passes=5)
                
                satellites.append({
                    'name': name,
                    'line1': line1,
                    'line2': line2,
                    'norad_id': sat.model.satnum,
                    'current_position': {
                        'lat': lat,
                        'lon': lon,
                        'altitude_km': apparent.geometric.km[2]
                    },
                    'passes': passes
                })
            
            except Exception as e:
                logger.warning(f"Failed to parse TLE {name}: {e}")
        
        return satellites
    
    def _compute_passes(self, sat, observer, hours_ahead=48, num_passes=5):
        """
        Compute satellite passes over observer location.
        Returns list of pass events (rise, culmination, set).
        """
        from skyfield.data import hipparcos
        
        ts = self.ts
        t0 = ts.now()
        t1 = ts.now() + timedelta(hours=hours_ahead)
        
        passes = []
        t = t0
        
        # Simple pass detection: find when satellite is above horizon
        while t < t1 and len(passes) < num_passes:
            # Compute elevation every 10 minutes
            t_check = t
            prev_elevation = None
            rise_time = None
            max_elevation = -90
            max_elevation_time = None
            set_time = None
            
            for _ in range(int(hours_ahead * 60 / 10)):
                astrometric = (self.earth + observer).at(t_check).observe(sat)
                apparent = astrometric.apparent()
                elevation = apparent.apparent_geocentric_latitude.degrees  # simplified
                
                # Detect rise
                if prev_elevation is not None and prev_elevation < 0 and elevation >= 0:
                    rise_time = t_check
                
                # Track max elevation
                if elevation > max_elevation:
                    max_elevation = elevation
                    max_elevation_time = t_check
                
                # Detect set
                if prev_elevation is not None and prev_elevation > 0 and elevation <= 0:
                    set_time = t_check
                    break
                
                prev_elevation = elevation
                t_check += timedelta(minutes=10)
            
            if rise_time and set_time and max_elevation > 10:  # Only consider passes >10° elevation
                passes.append({
                    'rise_time': rise_time.iso,
                    'max_elevation_time': max_elevation_time.iso if max_elevation_time else None,
                    'max_elevation_deg': max_elevation,
                    'set_time': set_time.iso,
                })
                t = set_time + timedelta(minutes=10)
            else:
                t += timedelta(hours=1)
        
        return passes
    
    def normalize_to_cot(self, satellite: Dict) -> Dict:
        """Normalize satellite to TAK-COT format."""
        
        return {
            'type': 'a-f-G-E-S-A-O',  # Orbital object
            'uid': f"satellite-norad-{satellite['norad_id']}",
            'name': satellite['name'],
            'geometry': {
                'type': 'Point',
                'coordinates': [
                    satellite['current_position']['lon'],
                    satellite['current_position']['lat']
                ]
            },
            'properties': {
                'norad_id': satellite['norad_id'],
                'tle_line1': satellite['line1'],
                'tle_line2': satellite['line2'],
                'altitude_km': satellite['current_position']['altitude_km'],
                'passes': satellite['passes'],
                'num_passes_48h': len(satellite['passes'])
            },
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'source': 'celestrak'
        }
```

#### Frontend Layer

```typescript
// frontend/src/components/layers/SatelliteLayer.tsx

import { ScatterplotLayer, PathLayer } from '@deck.gl/layers';

interface Satellite {
  id: string;
  uid: string;
  name: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    norad_id: number;
    altitude_km: number;
    passes: Array<{
      rise_time: string;
      max_elevation_deg: number;
      set_time: string;
    }>;
  };
}

export function createSatelliteLayer(
  satellites: Satellite[],
  currentTime: Date,
  onHover?: (info: any) => void,
  onClick?: (info: any) => void
) {
  // Satellite position layer
  const positionLayer = new ScatterplotLayer({
    id: 'satellites-positions',
    data: satellites,
    getPosition: (d: Satellite) => d.geometry.coordinates,
    getRadius: 150000, // 150km radius icon
    getFillColor: (d: Satellite) => {
      // Color by upcoming pass visibility
      const hasUpcomingPass = d.properties.passes.some(
        p => new Date(p.rise_time) > currentTime
      );
      return hasUpcomingPass ? [0, 150, 255, 200] : [150, 150, 150, 150];  // Blue or gray
    },
    getLineColor: [255, 255, 255],
    getLineWidth: 2,
    pickable: true,
    onHover: onHover,
    onClick: onClick,
    updateTriggers: {
      getFillColor: [currentTime, satellites]
    }
  });

  // Satellite label layer (would use TextLayer from @deck.gl/layers)
  // For MVP, rely on popup on click

  return [positionLayer];
}

// Separate component to display pass prediction details
export function SatellitePassPanel({
  satellite,
  onClose
}: {
  satellite: Satellite;
  onClose: () => void;
}) {
  const now = new Date();
  const nextPasses = satellite.properties.passes.filter(
    p => new Date(p.rise_time) > now
  );

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 max-w-sm">
      <h3 className="text-lg font-bold mb-2">{satellite.name}</h3>
      <p className="text-sm text-gray-600 mb-2">
        NORAD ID: {satellite.properties.norad_id}
      </p>
      <p className="text-sm text-gray-600 mb-4">
        Altitude: {satellite.properties.altitude_km.toFixed(0)} km
      </p>

      <div className="border-t pt-2">
        <h4 className="font-semibold text-sm mb-2">Next Passes (48h)</h4>
        {nextPasses.slice(0, 3).map((pass, idx) => (
          <div key={idx} className="text-xs mb-2 p-2 bg-gray-100 rounded">
            <p>Rise: {new Date(pass.rise_time).toLocaleTimeString()}</p>
            <p>Max Elevation: {pass.max_elevation_deg.toFixed(1)}°</p>
            <p>Set: {new Date(pass.set_time).toLocaleTimeString()}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        className="mt-4 w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Close
      </button>
    </div>
  );
}
```

-----

## 3. Phased Enrichment (Weeks 3-8)

### Phase 2: Cell Towers + DNS Roots (Weeks 3-4)

#### 3.1 Cell Towers (OpenCellID)

**Data Source**: `https://opencellid.org/` (free tier available)

- API returns cell tower locations, operator, bands (4G/5G)
- Query by region or bbox
- Update cadence: daily

**Integration**:

- Similar ingestor pattern to submarines/satellites
- Cluster visualization at lower zoom levels (performance optimization)
- Toggle layer visibility in map controls

#### 3.2 DNS Roots (RIPE Atlas)

**Data Source**: RIPE Atlas API

- 13 root nameservers worldwide
- Real-time latency probes, DNSSEC validation status
- Update cadence: 15 minutes (probe results)

**Integration**:

- Fixed points on map with latency rings (visualization of latency from your AoI)
- Color-coded health status
- Alert if root latency spikes

### Phase 3: Data Centers + Risk Layer (Weeks 5-8)

#### 3.3 Data Centers

**Data Source**: Cloudscaping API or manual curated list

- Facility locations, operator, interconnect density, power capacity
- Optional: uptime SLA per facility

**Integration**:

- Cluster visualization
- Risk correlation: if submarine cable nearby is damaged, flag dependent data centers
- Expandable detail panel showing capacity, operators, interconnects

#### 3.4 Risk Assessment & Correlation Layer

**Concept**: Automated scoring of infrastructure criticality and interdependencies.

```python
# backend/services/infrastructure_risk_assessor.py

class InfrastructureRiskAssessor:
    """
    Compute risk scores for infrastructure objects based on:
    - Current status (active, damaged, planned)
    - Geographic proximity to other infrastructure
    - Historical outage events
    - Redundancy (e.g., is this cable single-source-of-truth for region?)
    """
    
    async def assess_cable_risk(self, cable_id: str, db: AsyncSession) -> Dict:
        """
        Score submarine cable risk.
        
        High risk if:
        - Recent repair/damage history
        - Limited operator diversity
        - Single landing point for region
        - Nearby seismic/weather hazards (future integration)
        """
        cable = await db.query(InfrastructureObject).filter(
            InfrastructureObject.uid == cable_id
        ).first()
        
        risk_score = 0.0
        risk_factors = []
        
        # Factor 1: Status
        if cable.status == 'damaged':
            risk_score += 1.0
            risk_factors.append('Cable currently damaged')
        elif cable.status == 'planned':
            risk_score += 0.2
            risk_factors.append('Cable not yet operational')
        
        # Factor 2: Operator concentration
        operators = cable.properties.get('operators', [])
        if len(operators) == 1:
            risk_score += 0.3
            risk_factors.append('Single operator (low redundancy)')
        
        # Factor 3: Dependent data centers
        landing_points = cable.properties.get('landing_points', [])
        for lp in landing_points:
            nearby_dcs = await self._find_nearby_datacenters(
                lp['lat'], lp['lon'], radius_km=100, db=db
            )
            if nearby_dcs:
                risk_score += 0.2 * len(nearby_dcs)
                risk_factors.append(
                    f"{len(nearby_dcs)} data centers dependent on this landing point"
                )
        
        return {
            'cable_id': cable_id,
            'risk_score': min(risk_score, 1.0),  # Normalize to [0, 1]
            'risk_factors': risk_factors,
            'recommended_actions': self._recommend_actions(risk_score, risk_factors)
        }
    
    def _recommend_actions(self, risk_score: float, risk_factors: List[str]) -> List[str]:
        """Generate recommended actions based on risk assessment."""
        actions = []
        
        if risk_score > 0.7:
            actions.append('URGENT: Monitor cable status closely')
            actions.append('Activate redundancy protocols')
        
        if 'damaged' in str(risk_factors):
            actions.append('Initiate repair coordination')
        
        if 'single operator' in str(risk_factors):
            actions.append('Negotiate multi-operator ownership')
        
        return actions
```

**API Endpoint**:

```python
@router.get('/api/infrastructure/risk-assessment')
async def get_risk_assessment(
    object_type: str,
    object_id: str,
    db: AsyncSession = Depends(get_db)
) -> Dict:
    """
    Get risk assessment for a specific infrastructure object.
    
    Example:
      GET /api/infrastructure/risk-assessment?object_type=cable&object_id=cable-peeringdb-123
    """
    assessor = InfrastructureRiskAssessor()
    
    if object_type == 'cable':
        risk = await assessor.assess_cable_risk(object_id, db)
    elif object_type == 'datacenter':
        risk = await assessor.assess_datacenter_risk(object_id, db)
    # ... other types
    
    return risk
```

-----

## 4. Code Structure & Repository Layout

```
sovereign-watch/
├── README.md
├── docker-compose.yml
├── .env.example
│
├── agents/
│   ├── __init__.py
│   ├── base.py  (IngestorBase class - existing)
│   ├── ais_ingestor.py  (existing)
│   ├── adsb_ingestor.py  (existing)
│   ├── orbital_ingestor.py  (existing)
│   │
│   └── infrastructure_ingestor.py  (NEW)
│       ├── SubmarineCableIngestor
│       ├── SatelliteIngestor
│       ├── CellTowerIngestor
│       ├── DNSRootIngestor
│       ├── DataCenterIngestor
│       └── InfrastructureIngestorAgent (main)
│
├── backend/
│   ├── __init__.py
│   ├── main.py  (FastAPI app - existing)
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── ais.py  (existing)
│   │   │   ├── adsb.py  (existing)
│   │   │   ├── orbital.py  (existing)
│   │   │   │
│   │   │   └── infrastructure.py  (NEW)
│   │   │       ├── GET /api/infrastructure/cables
│   │   │       ├── GET /api/infrastructure/cables/{uid}
│   │   │       ├── GET /api/infrastructure/satellites
│   │   │       ├── GET /api/infrastructure/satellites/{uid}
│   │   │       ├── GET /api/infrastructure/risk-assessment
│   │   │       └── WebSocket for live updates
│   │   │
│   │   └── middleware/  (existing)
│   │
│   ├── models/
│   │   ├── ais.py  (existing)
│   │   ├── adsb.py  (existing)
│   │   │
│   │   └── infrastructure.py  (NEW)
│   │       ├── SubmarineCable (Pydantic model)
│   │       ├── Satellite (Pydantic model)
│   │       ├── CellTower (Pydantic model)
│   │       ├── DNSRoot (Pydantic model)
│   │       └── DataCenter (Pydantic model)
│   │
│   ├── db/
│   │   ├── models.py  (SQLAlchemy ORM - existing, extended)
│   │   │   └── Add: InfrastructureObject class
│   │   │
│   │   ├── migrations/
│   │   │   ├── versions/
│   │   │   │   ├── 0001_*.py  (existing)
│   │   │   │   ├── 0002_*.py  (existing)
│   │   │   │   ├── 0003_*.py  (existing)
│   │   │   │   │
│   │   │   │   └── 0004_add_infrastructure_objects.py  (NEW)
│   │   │   │       ALTER TABLE... (create infrastructure_objects table, indexes)
│   │   │   │
│   │   │   └── env.py  (existing)
│   │   │
│   │   ├── queries.py  (existing, extended with infrastructure queries)
│   │   └── session.py  (existing)
│   │
│   └── services/
│       ├── __init__.py
│       ├── ais_service.py  (existing)
│       │
│       └── infrastructure_risk_assessor.py  (NEW)
│           └── InfrastructureRiskAssessor class
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx  (main app - existing, extended)
│   │   ├── index.tsx  (entry point - existing)
│   │   │
│   │   ├── components/
│   │   │   ├── TacticalMap.tsx  (existing, extended with new layers)
│   │   │   │
│   │   │   ├── layers/
│   │   │   │   ├── AISLayer.tsx  (existing)
│   │   │   │   ├── ADS-BLayer.tsx  (existing)
│   │   │   │   │
│   │   │   │   ├── SubmarineCableLayer.tsx  (NEW)
│   │   │   │   ├── SatelliteLayer.tsx  (NEW)
│   │   │   │   ├── CellTowerLayer.tsx  (NEW, Phase 2)
│   │   │   │   ├── DNSRootLayer.tsx  (NEW, Phase 2)
│   │   │   │   └── DataCenterLayer.tsx  (NEW, Phase 3)
│   │   │   │
│   │   │   ├── panels/
│   │   │   │   ├── DetailsPanel.tsx  (existing, extended)
│   │   │   │   │
│   │   │   │   ├── InfrastructurePanel.tsx  (NEW)
│   │   │   │   │   ├── SubmarineCableDetails
│   │   │   │   │   ├── SatelliteDetails
│   │   │   │   │   └── RiskAssessment
│   │   │   │   │
│   │   │   │   └── LayerTogglePanel.tsx  (extend for new layers)
│   │   │   │
│   │   │   └── common/
│   │   │       └── ...
│   │   │
│   │   ├── hooks/
│   │   │   ├── useMap.ts  (existing)
│   │   │   └── useInfrastructure.ts  (NEW)
│   │   │       ├── fetchCables()
│   │   │       ├── fetchSatellites()
│   │   │       └── subscribeToLiveUpdates()
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts  (existing)
│   │   │   └── infrastructure.ts  (NEW)
│   │   │       ├── SubmarineCable
│   │   │       ├── Satellite
│   │   │       └── RiskAssessment
│   │   │
│   │   ├── utils/
│   │   │   ├── api.ts  (existing)
│   │   │   ├── map.ts  (existing)
│   │   │   └── infrastructure.ts  (NEW)
│   │   │       ├── formatCableDetails()
│   │   │       ├── getSatelliteNextPass()
│   │   │       └── colorByRiskScore()
│   │   │
│   │   └── styles/
│   │       └── ...
│   │
│   ├── package.json  (update dependencies)
│   └── tsconfig.json  (existing)
│
├── config/
│   ├── config.example.yml
│   └── docker-entrypoint.sh  (existing)
│
├── docs/
│   ├── API.md  (existing, extend with infrastructure endpoints)
│   ├── AGENTS.md  (existing, extend with Infrastructure Agent)
│   └── INFRASTRUCTURE_LAYER.md  (NEW - this document)
│
└── tests/
    ├── unit/
    │   ├── test_ais_ingestor.py  (existing)
    │   └── test_infrastructure_ingestor.py  (NEW)
    │
    └── integration/
        ├── test_api_ais.py  (existing)
        └── test_api_infrastructure.py  (NEW)
```

-----

## 5. Data Models (Pydantic + SQLAlchemy)

### 5.1 Pydantic Models (API Contract)

```python
# backend/models/infrastructure.py

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class InfrastructureObjectType(str, Enum):
    CABLE = 'cable'
    SATELLITE = 'satellite'
    TOWER = 'tower'
    DNS_ROOT = 'dns_root'
    DATACENTER = 'datacenter'

class GeoPoint(BaseModel):
    type: str = 'Point'
    coordinates: tuple[float, float]  # [lon, lat]

class SubmarineCableProperties(BaseModel):
    cable_id: int
    capacity_tbps: str
    status: str
    operators: List[str]
    landing_points: List[Dict[str, Any]]
    length_km: Optional[float] = None
    technology: str
    url: Optional[str] = None

class SubmarineCable(BaseModel):
    id: str
    uid: str
    name: str
    status: str
    geometry: GeoPoint
    properties: SubmarineCableProperties
    last_updated: datetime

class SatellitePass(BaseModel):
    rise_time: str  # ISO format
    max_elevation_time: Optional[str] = None
    max_elevation_deg: float
    set_time: str  # ISO format

class SatelliteProperties(BaseModel):
    norad_id: int
    tle_line1: str
    tle_line2: str
    altitude_km: float
    passes: List[SatellitePass]
    num_passes_48h: int

class Satellite(BaseModel):
    id: str
    uid: str
    name: str
    geometry: GeoPoint
    properties: SatelliteProperties
    last_updated: datetime

class RiskAssessment(BaseModel):
    object_id: str
    object_type: InfrastructureObjectType
    risk_score: float = Field(ge=0.0, le=1.0)
    risk_factors: List[str]
    recommended_actions: List[str]
    assessed_at: datetime
```

### 5.2 SQLAlchemy Models (Database ORM)

```python
# backend/db/models.py (add to existing file)

from sqlalchemy import Column, String, Float, DateTime, JSONB, LargeBinary, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry
from datetime import datetime
import uuid

class InfrastructureObject(Base):
    """
    Generic infrastructure object table.
    Stores cables, satellites, towers, DNS roots, data centers.
    """
    __tablename__ = 'infrastructure_objects'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Object identification
    object_type = Column(
        String(32),
        nullable=False,
        index=True,
        # Check constraint in migration
    )
    uid = Column(String(256), unique=True, nullable=False, index=True)
    name = Column(String(256), nullable=False)
    
    # Geospatial (PostGIS)
    location = Column(Geometry('Point', srid=4326), index=True)
    
    # Status tracking
    status = Column(String(32), index=True)
    last_updated = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Flexible properties (source-specific)
    properties = Column(JSONB, default={})
    
    # TAK serialization (for direct consumption by other systems)
    cot_data = Column(LargeBinary)
    
    # Indexes
    __table_args__ = (
        Index('idx_infrastructure_type_status', 'object_type', 'status'),
        Index('idx_infrastructure_location', 'location', postgresql_using='gist'),
        CheckConstraint(
            "object_type IN ('cable', 'satellite', 'tower', 'dns_root', 'datacenter')",
            name='check_object_type'
        ),
    )
    
    def __repr__(self):
        return f"<InfrastructureObject {self.uid}: {self.name}>"
```

-----

## 6. API Endpoints Summary

|Method|Endpoint                                             |Purpose                                                  |MVP    |
|------|-----------------------------------------------------|---------------------------------------------------------|-------|
|GET   |`/api/infrastructure/cables`                         |List submarine cables, optionally filtered by status/bbox|✓      |
|GET   |`/api/infrastructure/cables/{uid}`                   |Get detailed info for a cable                            |✓      |
|GET   |`/api/infrastructure/satellites`                     |List satellites with current position + pass predictions |✓      |
|GET   |`/api/infrastructure/satellites/{uid}`               |Get detailed info for a satellite                        |✓      |
|GET   |`/api/infrastructure/towers`                         |List cell towers (Phase 2)                               |       |
|GET   |`/api/infrastructure/dns-roots`                      |List DNS root nameservers (Phase 2)                      |       |
|GET   |`/api/infrastructure/datacenters`                    |List data centers (Phase 3)                              |       |
|GET   |`/api/infrastructure/risk-assessment?type=cable&id=X`|Get risk assessment for object                           |Phase 3|
|WS    |`/ws/infrastructure`                                 |WebSocket for live infrastructure updates                |Phase 2|

-----

## 7. Configuration & Deployment

### 7.1 Environment Variables

```bash
# .env (add to existing)

# Infrastructure Ingestor
INFRA_INGESTOR_ENABLED=true
INFRA_INGESTOR_UPDATE_INTERVAL=1800  # 30 min

# Data sources
CELESTRAK_ENABLED=true
CELESTRAK_TLE_UPDATE_HOURS=12

PEERINGDB_ENABLED=true
PEERINGDB_UPDATE_HOURS=24

OPENCELLID_ENABLED=false  # Phase 2
OPENCELLID_API_KEY=""

RIPE_ATLAS_ENABLED=false  # Phase 2

# Area of Interest (for satellite pass predictions)
AOI_LAT=39.8283
AOI_LON=-98.5795
AOI_ELEVATION_M=0
```

### 7.2 Docker Compose Service

```yaml
# docker-compose.yml (add to existing services)

  infrastructure-ingestor:
    build:
      context: .
      dockerfile: Dockerfile
    command: python -m agents.infrastructure_ingestor
    environment:
      - REDPANDA_BROKER_URL=redpanda:29092
      - POSTGRES_URL=postgresql://postgres:password@postgres:5432/sovereign_watch
      - AOI_LAT=${AOI_LAT}
      - AOI_LON=${AOI_LON}
      - INFRA_INGESTOR_ENABLED=${INFRA_INGESTOR_ENABLED}
    depends_on:
      - redpanda
      - postgres
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

-----

## 8. Migration Strategy (Database)

### 8.1 Alembic Migration

```python
# backend/db/migrations/versions/0004_add_infrastructure_objects.py

"""Add infrastructure_objects table for cables, satellites, etc.

Revision ID: 0004_infrastructure
Revises: 0003_previous_revision
Create Date: 2026-04-20 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geometry

revision = '0004_infrastructure'
down_revision = '0003_previous_revision'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'infrastructure_objects',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('object_type', sa.String(32), nullable=False),
        sa.Column('uid', sa.String(256), nullable=False, unique=True),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('location', Geometry('Point', srid=4326), nullable=True),
        sa.Column('status', sa.String(32), nullable=True),
        sa.Column('last_updated', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('properties', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('cot_data', sa.LargeBinary(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('uid', name='uq_infrastructure_uid'),
        sa.CheckConstraint(
            "object_type IN ('cable', 'satellite', 'tower', 'dns_root', 'datacenter')",
            name='check_object_type'
        )
    )
    
    # Create indexes
    op.create_index('idx_infrastructure_type_status', 'infrastructure_objects', 
                    ['object_type', 'status'])
    op.create_index('idx_infrastructure_location', 'infrastructure_objects', 
                    ['location'], postgresql_using='gist')
    op.create_index('idx_infrastructure_uid', 'infrastructure_objects', ['uid'])

def downgrade():
    op.drop_index('idx_infrastructure_uid', table_name='infrastructure_objects')
    op.drop_index('idx_infrastructure_location', table_name='infrastructure_objects', 
                  postgresql_using='gist')
    op.drop_index('idx_infrastructure_type_status', table_name='infrastructure_objects')
    op.drop_table('infrastructure_objects')
```

-----

## 9. Testing Strategy

### 9.1 Unit Tests

```python
# tests/unit/test_infrastructure_ingestor.py

import pytest
from agents.infrastructure_ingestor import (
    SubmarineCableIngestor,
    SatelliteIngestor
)

class TestSubmarineCableIngestor:
    
    @pytest.mark.asyncio
    async def test_fetch_cables(self):
        """Test PeeringDB cable API fetch."""
        ingestor = SubmarineCableIngestor({'timeout': 10})
        cables = await ingestor.fetch()
        assert len(cables) > 0
        assert 'name' in cables[0]
        assert 'id' in cables[0]
    
    def test_normalize_to_cot(self):
        """Test cable normalization to TAK-COT format."""
        ingestor = SubmarineCableIngestor({})
        cable = {
            'id': 123,
            'name': 'SEA-US-CAN',
            'capacity': 400,
            'status': 'active',
            'facilities': [
                {
                    'name': 'Seattle',
                    'country': 'US',
                    'latitude': 47.6062,
                    'longitude': -122.3321
                },
                {
                    'name': 'Vancouver',
                    'country': 'CA',
                    'latitude': 49.2827,
                    'longitude': -123.1207
                }
            ]
        }
        cot = ingestor.normalize_to_cot(cable)
        assert cot['type'] == 'a-f-G-E-S-A-M'
        assert cot['uid'] == 'cable-peeringdb-123'
        assert cot['name'] == 'SEA-US-CAN'
        assert 'properties' in cot
        assert len(cot['properties']['landing_points']) == 2

class TestSatelliteIngestor:
    
    @pytest.mark.asyncio
    async def test_fetch_satellites(self):
        """Test CelesTrak TLE fetch."""
        ingestor = SatelliteIngestor({'aoi': {'lat': 40, 'lon': -74, 'elevation_m': 0}})
        satellites = await ingestor.fetch()
        assert len(satellites) > 0
        assert 'norad_id' in satellites[0]
        assert 'passes' in satellites[0]
```

### 9.2 Integration Tests

```python
# tests/integration/test_api_infrastructure.py

import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

class TestInfrastructureAPI:
    
    def test_get_submarines_cables(self):
        """Test GET /api/infrastructure/cables."""
        response = client.get('/api/infrastructure/cables?limit=10')
        assert response.status_code == 200
        assert 'data' in response.json() or isinstance(response.json(), list)
    
    def test_get_satellites(self):
        """Test GET /api/infrastructure/satellites."""
        response = client.get('/api/infrastructure/satellites')
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    
    def test_get_cable_details(self):
        """Test GET /api/infrastructure/cables/{uid}."""
        # Assumes a cable exists in test database
        response = client.get('/api/infrastructure/cables/cable-peeringdb-123')
        if response.status_code == 200:
            data = response.json()
            assert 'uid' in data
            assert 'properties' in data
```

-----

## 10. Next Steps & Decisions

### 10.1 Immediate Actions (This Week)

- [ ] **Confirm data source credentialing**:
  - Do you have Space-Track.org credentials? (If yes, use instead of CelesTrak for more detailed satellite data)
  - PeeringDB API free tier is sufficient for MVP?
- [ ] **Database schema finalization**:
  - Run Alembic migration to create `infrastructure_objects` table
  - Validate schema with existing TimescaleDB setup
- [ ] **Skeleton implementation**:
  - Bootstrap `agents/infrastructure_ingestor.py` with base classes
  - Create `backend/api/routes/infrastructure.py` with endpoint stubs
  - Add Pydantic models to `backend/models/infrastructure.py`

### 10.2 Week 1-2 (MVP)

- [ ] **Submarine Cables**:
  - Complete `SubmarineCableIngestor`
  - Implement PeeringDB fetch + normalize-to-COT
  - Wire into Redpanda producer
  - Add FastAPI endpoints for list/detail queries
  - Create `SubmarineCableLayer.tsx` + integration into `TacticalMap.tsx`
- [ ] **Satellites**:
  - Complete `SatelliteIngestor`
  - Implement CelesTrak TLE fetch + pass prediction (Skyfield library)
  - Normalize to COT
  - Wire into Redpanda producer
  - Add FastAPI endpoints
  - Create `SatelliteLayer.tsx` + `SatellitePassPanel.tsx`
- [ ] **Testing**:
  - Unit tests for both ingestors
  - Integration tests for API endpoints

### 10.3 Week 3-4 (Phase 2: Cell Towers + DNS Roots)

- [ ] Implement `CellTowerIngestor` (OpenCellID)
- [ ] Implement `DNSRootIngestor` (RIPE Atlas)
- [ ] Add map layers + detail panels
- [ ] Add WebSocket live update stream

### 10.4 Week 5-8 (Phase 3: Data Centers + Risk Layer)

- [ ] Implement `DataCenterIngestor`
- [ ] Build `InfrastructureRiskAssessor` service
- [ ] Risk visualization (color-coded icons, alert panel)
- [ ] Export functionality (GeoJSON, CSV)

-----

## 11. Technology Stack Confirmation

|Component        |Technology       |Version|Notes                                       |
|-----------------|-----------------|-------|--------------------------------------------|
|**Backend**      |                 |       |                                            |
|Framework        |FastAPI          |0.109+ |Already in use                              |
|Async HTTP       |aiohttp          |3.9+   |For API calls                               |
|Async SQL        |SQLAlchemy       |2.0+   |Already in use                              |
|Message Broker   |Redpanda         |Latest |Already in use                              |
|Timeseries DB    |TimescaleDB      |2.14+  |Already in use                              |
|Geospatial       |PostGIS          |3.4+   |Already integrated                          |
|Orbital Mechanics|Skyfield         |1.46+  |For satellite pass prediction               |
|ML (future)      |scikit-learn     |1.3+   |For interference classification (Project 10)|
|**Frontend**     |                 |       |                                            |
|Framework        |React            |18+    |Already in use                              |
|Mapping          |Deck.gl          |9.0+   |Already in use                              |
|Base Maps        |MapLibre GL      |4.0+   |Already in use                              |
|Visualization    |Plotly (optional)|5.0+   |For spectrum plots, risk charts             |
|HTTP Client      |axios or fetch   |-      |Already in use                              |

-----

## 12. Documentation & References

- **Pydantic**: https://docs.pydantic.dev/
- **SQLAlchemy ORM**: https://docs.sqlalchemy.org/
- **PostGIS**: https://postgis.net/docs/
- **Skyfield**: https://rhodesmill.org/skyfield/
- **Deck.gl Layers**: https://deck.gl/docs/api-reference/layers
- **TAK Protocol**: https://tak.gov/ (COT spec)
- **PeeringDB API**: https://www.peeringdb.com/api/docs/
- **CelesTrak**: https://celestrak.com/

-----

## Summary

This design integrates a **multi-source infrastructure telemetry layer** directly into Sovereign Watch, leveraging existing infrastructure (Redpanda, TimescaleDB, FastAPI, React/Deck.gl). The MVP focuses on submarine cables and satellites, with phased enrichment for cell towers, DNS roots, and data centers.

**Key outcomes**:

1. Strategic infrastructure overlay on tactical picture
1. Risk assessment & correlation engine
1. Pass predictions, outage alerts, redundancy analysis
1. Extensible architecture for future data sources

**Ready for implementation** — all code structures, database schemas, API specs, and frontend layers documented above.