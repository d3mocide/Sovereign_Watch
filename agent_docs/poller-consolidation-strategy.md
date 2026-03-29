# Poller Consolidation Strategy
## NDBC + SMAPS + NOTAM Integration into Existing Pollers

**Date**: March 28, 2026
**Context**: Implementing research from `research-geospatial-data-layers-implementation.md`
**Goal**: Add three new critical data sources (ocean buoys, maritime piracy, FAA airspace) with **maximum code reuse** and **minimum new containers**.

---

## Executive Summary

**Recommended Approach: 1 Extended Poller + 1 New Lightweight Poller**

| Consolidation Strategy | Effort | Complexity | Container Count | Notes |
|---|---|---|---|---|
| **Option A: Extend infra_poller for NDBC+SMAPS** | ~50 hrs | Medium | +0 containers | **RECOMMENDED** |
| **Option B: New maritime_data_poller for NDBC+SMAPS+NOTAM** | ~60 hrs | Low | +1 container | Cleanest separation |
| **Option C: Extend all three (aviation+maritime+infra)** | ~75 hrs | High | +0 containers | Overcomplicates existing pollers |

---

## Option A: Extend infra_poller (RECOMMENDED)

### Rationale

**infra_poller is the optimal host for NDBC + SMAPS:**

| Criterion | Score | Rationale |
|-----------|-------|-----------|
| **Domain alignment** | ✅ | Maritime infrastructure (cables + outages + hazards) |
| **Architecture fitness** | ✅✅ | Already multi-source (3 independent async loops) |
| **Polling pattern** | ✅✅ | Interval-based (1h, 30m, 7d) matches NDBC (15m) + SMAPS (1h) |
| **Data model** | ✅✅ | Uses PostgreSQL + Redis; NDBC/SMAPS tables fit seamlessly |
| **Test impact** | ✅ | No new test files needed, extend existing `test_infra.py` |
| **Container overhead** | ✅✅ | Zero new containers, reuse existing infra_poller service |
| **Separation of concerns** | ⚠️ | Expands from "cables/outages/towers" to "maritime infra + hazards" (still cohesive) |

### Current infra_poller Structure

```
backend/ingestion/infra_poller/
├── main.py                    # Entry point (InfraPollerService inline)
├── pyproject.toml             # Dependencies
├── Dockerfile
├── tests/
│   └── test_infra.py          # Existing tests
├── utils.py                   # DMS → decimal conversion
└── (no sources/ subdir)       # Inline implementation
```

**Current Loops:**
1. `cables_loop()` → 7-day interval → submarine cables + landing stations → Redis
2. `ioda_loop()` → 30-min interval → country-level internet outages → Redis
3. `fcc_loop()` → 7-day interval (hour-gated) → FCC tower registrations → PostgreSQL

**Memory Budget**: ~150 MB (from current CLAUDE.md notes)

---

## Option A - Implementation Plan

### Step 1: Create NDBC Source Module (`backend/ingestion/infra_poller/sources/ndbc.py`)

```python
# New file: backend/ingestion/infra_poller/sources/ndbc.py

import json
from datetime import datetime
from typing import Optional
import aiohttp
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

class NDBCSource:
    """
    Polls NOAA NDBC latest_obs.txt (updated every 5 minutes).
    Parses whitespace-delimited observations → writes to ndbc_obs hypertable.
    """

    BASE_URL = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"

    def __init__(self, session: AsyncSession, redis_client, db_engine):
        self.session = session
        self.redis_client = redis_client
        self.db_engine = db_engine
        self.last_etag: Optional[str] = None

    async def fetch_observations(self) -> Optional[dict]:
        """
        Fetch latest_obs.txt with ETag caching.
        Returns dict of {buoy_id: observation_dict} or None if cached.
        """
        timeout = aiohttp.ClientTimeout(total=30.0)
        async with aiohttp.ClientSession(timeout=timeout) as client:
            headers = {}
            cached_etag = await self.redis_client.get("ndbc:last_etag")
            if cached_etag:
                headers["If-None-Match"] = cached_etag

            async with client.get(self.BASE_URL, headers=headers) as resp:
                if resp.status == 304:  # Not Modified
                    return None
                resp.raise_for_status()

                etag = resp.headers.get("ETag")
                if etag:
                    self.last_etag = etag
                    await self.redis_client.set("ndbc:last_etag", etag)

                text = await resp.text()
                return self._parse_latest_obs(text)

    def _parse_latest_obs(self, text: str) -> dict:
        """
        Parse TSV-like format (whitespace-delimited).
        Header row: NDBC Station identification number, Latitude, Longitude, ...
        """
        lines = text.strip().split('\n')
        if len(lines) < 3:
            return {}

        # Line 1: Header names (e.g., "#YY MM DD hh mm WVHT SWVHT WVPK WVDIR...")
        header = lines[1].split()

        observations = {}
        for line in lines[2:]:
            if line.startswith('#'):
                continue

            parts = line.split()
            if len(parts) < 7:
                continue

            buoy_id = parts[0]
            try:
                year = int(parts[1])
                month = int(parts[2])
                day = int(parts[3])
                hour = int(parts[4])
                minute = int(parts[5])

                # Map fields (order from NDBC header)
                obs = {
                    'buoy_id': buoy_id,
                    'time': datetime(year, month, day, hour, minute),
                    'wvht_meters': self._safe_float(parts[6]),
                    'wtmp_celsius': self._safe_float(parts[14]) if len(parts) > 14 else None,
                    'wspd_ms': self._safe_float(parts[7]) if len(parts) > 7 else None,
                    'wdir_degrees': self._safe_float(parts[8]) if len(parts) > 8 else None,
                    'gst_ms': self._safe_float(parts[9]) if len(parts) > 9 else None,
                    'dpd_seconds': self._safe_float(parts[10]) if len(parts) > 10 else None,
                    'pres_hpa': self._safe_float(parts[11]) if len(parts) > 11 else None,
                }
                observations[buoy_id] = obs
            except (ValueError, IndexError):
                continue

        return observations

    @staticmethod
    def _safe_float(val: str) -> Optional[float]:
        """Convert NDBC missing value indicators (99, 999, MM, etc.) to None."""
        if val in ('MM', '999', '99', '9999', '-9999'):
            return None
        try:
            f = float(val)
            return f if f != 999 else None
        except ValueError:
            return None

    async def ingest_observations(self, observations: dict):
        """Insert observations into ndbc_obs hypertable."""
        async with self.db_engine.begin() as conn:
            # Prepare bulk insert
            insert_stmt = text("""
                INSERT INTO ndbc_obs (
                    time, buoy_id, geom, wvht_meters, wtmp_celsius,
                    wspd_ms, wdir_degrees, gst_ms, dpd_seconds, pres_hpa, h3_res5
                )
                VALUES (
                    :time, :buoy_id,
                    ST_SetSRID(ST_Point(:lon, :lat), 4326),
                    :wvht_meters, :wtmp_celsius,
                    :wspd_ms, :wdir_degrees, :gst_ms, :dpd_seconds, :pres_hpa,
                    :h3_res5
                )
                ON CONFLICT DO NOTHING
            """)

            for buoy_id, obs in observations.items():
                # TODO: Fetch lat/lon from NDBC station metadata cache
                # For MVP, could hard-code known NDBC locations or fetch separately
                await conn.execute(insert_stmt, {
                    'time': obs['time'],
                    'buoy_id': buoy_id,
                    'lat': 0,  # Fetch from metadata
                    'lon': 0,  # Fetch from metadata
                    'wvht_meters': obs['wvht_meters'],
                    'wtmp_celsius': obs['wtmp_celsius'],
                    'wspd_ms': obs['wspd_ms'],
                    'wdir_degrees': obs['wdir_degrees'],
                    'gst_ms': obs['gst_ms'],
                    'dpd_seconds': obs['dpd_seconds'],
                    'pres_hpa': obs['pres_hpa'],
                    'h3_res5': 'h3_placeholder'  # Compute from lat/lon
                })
```

### Step 2: Create SMAPS Source Module (`backend/ingestion/infra_poller/sources/smaps.py`)

```python
# New file: backend/ingestion/infra_poller/sources/smaps.py

import asyncio
import zipfile
import tempfile
from io import BytesIO
from datetime import datetime
import aiohttp
import geopandas as gpd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

class SMAPSSource:
    """
    Downloads NGA SMAPS piracy shapefile weekly.
    Parses with geopandas → writes to smaps_incidents table.
    """

    SHAPEFILE_URL = "https://msi.nga.mil/api/public/SMAPS/SMAPS-shapefiles/latest.zip"

    def __init__(self, session: AsyncSession, redis_client, db_engine):
        self.session = session
        self.redis_client = redis_client
        self.db_engine = db_engine

    async def fetch_shapefile(self) -> Optional[bytes]:
        """Download SMAPS shapefile ZIP."""
        timeout = aiohttp.ClientTimeout(total=60.0)  # Large ZIP
        async with aiohttp.ClientSession(timeout=timeout) as client:
            async with client.get(self.SHAPEFILE_URL) as resp:
                if resp.status == 404:
                    print("SMAPS shapefile not found (may be scheduled maintenance)")
                    return None
                resp.raise_for_status()
                return await resp.read()

    async def parse_and_ingest(self, zip_bytes: bytes):
        """
        Extract ZIP → parse shapefile with geopandas → insert to DB.
        Offload to thread pool to avoid blocking async loop.
        """
        loop = asyncio.get_event_loop()
        gdf = await loop.run_in_executor(
            None,
            self._parse_shapefile_sync,
            zip_bytes
        )

        if gdf is None:
            return

        # Ingest to DB
        async with self.db_engine.begin() as conn:
            for _, row in gdf.iterrows():
                insert_stmt = text("""
                    INSERT INTO smaps_incidents (
                        date, geom, attack_type, vessel_name,
                        description, imb_ref, threat_score, h3_res5
                    )
                    VALUES (
                        :date,
                        ST_SetSRID(ST_GeomFromWKB(:geom), 4326),
                        :attack_type, :vessel_name, :description, :imb_ref,
                        :threat_score, :h3_res5
                    )
                    ON CONFLICT DO NOTHING
                """)

                threat_score = self._compute_threat_score(
                    row.get('type', ''),
                    row.get('date')
                )

                await conn.execute(insert_stmt, {
                    'date': row.get('date'),
                    'geom': row.geometry.wkb,
                    'attack_type': row.get('type', 'Unknown'),
                    'vessel_name': row.get('vessel', None),
                    'description': row.get('description', ''),
                    'imb_ref': row.get('reference', None),
                    'threat_score': threat_score,
                    'h3_res5': self._compute_h3_cell(row.geometry)
                })

    @staticmethod
    def _parse_shapefile_sync(zip_bytes: bytes) -> Optional[gpd.GeoDataFrame]:
        """Parse shapefile synchronously (runs in thread pool)."""
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
                    zf.extractall(tmpdir)

                # Find .shp file in temp dir
                shp_files = list(Path(tmpdir).glob("**/*.shp"))
                if not shp_files:
                    print("No shapefile found in SMAPS ZIP")
                    return None

                gdf = gpd.read_file(str(shp_files[0]))
                # Ensure WGS84
                if gdf.crs != "EPSG:4326":
                    gdf = gdf.to_crs("EPSG:4326")

                return gdf
        except Exception as e:
            print(f"Error parsing SMAPS shapefile: {e}")
            return None

    @staticmethod
    def _compute_threat_score(attack_type: str, date) -> float:
        """
        Rolling 90-day threat score:
        - Kidnapping: 3× multiplier
        - Hijacking: 2.5×
        - Armed Robbery: 1.5×
        - Time decay: Recent (≤7d) = 10, ≤30d = 5, ≤90d = 2
        """
        from datetime import datetime

        if not date:
            return 0

        days_old = (datetime.now().date() - date).days

        time_factor = 10 if days_old <= 7 else (5 if days_old <= 30 else 2 if days_old <= 90 else 0)

        type_factor = {
            'Kidnapping': 3,
            'Hijacking': 2.5,
            'Armed Robbery': 1.5,
            'Boarding': 1,
        }.get(attack_type, 1)

        return time_factor * type_factor

    @staticmethod
    def _compute_h3_cell(geometry, resolution: int = 5) -> str:
        """Convert geometry centroid to H3 cell."""
        import h3
        return h3.latlng_to_cell(
            geometry.centroid.y,
            geometry.centroid.x,
            resolution
        )
```

### Step 3: Modify infra_poller main.py

```python
# backend/ingestion/infra_poller/main.py

# Add to imports:
from sources.ndbc import NDBCSource
from sources.SMAPS import SMAPSSource

# In InfraPollerService class, add new methods:

class InfraPollerService:
    # ... existing __init__, setup, shutdown methods ...

    async def run(self):
        """Run all infrastructure polling loops concurrently."""
        tasks = [
            self.cables_loop(),
            self.ioda_loop(),
            self.fcc_loop(),
            self.ndbc_loop(),      # NEW
            self.smaps_loop(),       # NEW
        ]
        await asyncio.gather(*tasks)

    async def ndbc_loop(self):
        """Poll NDBC latest_obs.txt every 15 minutes."""
        ndbc = NDBCSource(self.session, self.redis_client, self.db_engine)

        while self.running:
            try:
                last_fetch = await self.redis_client.get("poller:ndbc:last_fetch")
                if last_fetch:
                    elapsed = time.time() - float(last_fetch)
                    if elapsed < 900:  # 15 min
                        await asyncio.sleep(900 - elapsed)

                observations = await ndbc.fetch_observations()
                if observations:  # None if cached via ETag
                    await ndbc.ingest_observations(observations)
                    print(f"Ingested {len(observations)} NDBC observations")

                await self.redis_client.set(
                    "poller:ndbc:last_fetch",
                    str(time.time())
                )
            except Exception as e:
                await self.redis_client.set(
                    "poller:ndbc:last_error",
                    json.dumps({'error': str(e), 'time': datetime.now().isoformat()}),
                    ex=86400
                )
                await asyncio.sleep(300)  # Backoff 5 min on error

    async def smaps_loop(self):
        """Download SMAPS shapefile weekly (schedule: 15:00 ET weekdays)."""
        SMAPS = SMAPSSource(self.session, self.redis_client, self.db_engine)

        while self.running:
            try:
                if not self._should_run_SMAPS():
                    await asyncio.sleep(3600)  # Check every hour
                    continue

                zip_bytes = await SMAPS.fetch_shapefile()
                if zip_bytes:
                    await SMAPS.parse_and_ingest(zip_bytes)
                    print("Ingested SMAPS incidents")

                await self.redis_client.set(
                    "poller:SMAPS:last_fetch",
                    str(time.time())
                )
            except Exception as e:
                await self.redis_client.set(
                    "poller:SMAPS:last_error",
                    json.dumps({'error': str(e), 'time': datetime.now().isoformat()}),
                    ex=86400
                )
                await asyncio.sleep(600)

    def _should_run_SMAPS(self) -> bool:
        """Check if we should run SMAPS (weekday 15:00 ET)."""
        from datetime import datetime
        import pytz

        et = pytz.timezone('America/New_York')
        now = datetime.now(et)

        # Weekday (0-4 = Mon-Fri) and 15:00-16:00 window
        return (now.weekday() < 5 and 15 <= now.hour < 16)
```

### Step 4: Update Database Schema

```sql
-- Add to backend/db/init.sql

-- NDBC buoy observations hypertable
CREATE TABLE IF NOT EXISTS ndbc_obs (
  time           TIMESTAMPTZ NOT NULL,
  buoy_id        TEXT NOT NULL,
  geom           GEOMETRY(Point, 4326) NOT NULL,
  wvht_meters    FLOAT,           -- Significant wave height
  wtmp_celsius   FLOAT,           -- Sea surface temperature
  wspd_ms        FLOAT,           -- Wind speed
  wdir_degrees   FLOAT,           -- Wind direction
  gst_ms         FLOAT,           -- Gust speed
  dpd_seconds    FLOAT,           -- Dominant wave period
  pres_hpa       FLOAT,           -- Atmospheric pressure
  h3_res5        TEXT,            -- H3 cell (for spatial partitioning)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable(
  'ndbc_obs', 'time',
  if_not_exists => TRUE
);

CREATE INDEX ndbc_geom_idx ON ndbc_obs USING GIST (geom);
CREATE INDEX ndbc_buoy_id_idx ON ndbc_obs (buoy_id, time DESC);
CREATE INDEX ndbc_h3_idx ON ndbc_obs (h3_res5);

-- Continuous aggregate: 30-day rolling mean + stddev per buoy
CREATE MATERIALIZED VIEW IF NOT EXISTS ndbc_anomaly_baseline AS
SELECT
  buoy_id,
  time_bucket('1 hour', time) AS hour,
  avg(wvht_meters) AS wvht_mean,
  stddev(wvht_meters) AS wvht_stddev,
  avg(wtmp_celsius) AS wtmp_mean,
  stddev(wtmp_celsius) AS wtmp_stddev,
  FIRST(geom, time) AS geom
FROM ndbc_obs
WHERE time > NOW() - INTERVAL '30 days'
GROUP BY buoy_id, time_bucket('1 hour', time)
WITH DATA;

-- Retention policy: keep only latest 30 days
SELECT add_retention_policy('ndbc_obs', INTERVAL '30 days', if_not_exists => TRUE);

-- Compression policy: compress after 4 hours
SELECT add_compression_policy('ndbc_obs', INTERVAL '4 hours', if_not_exists => TRUE);

-- NGA SMAPS piracy incidents
CREATE TABLE IF NOT EXISTS smaps_incidents (
  id              SERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  geom            GEOMETRY(Point, 4326) NOT NULL,
  attack_type     TEXT NOT NULL,            -- Armed Robbery, Boarding, Hijacking, Kidnapping
  vessel_name     TEXT,
  description     TEXT,
  imb_ref         TEXT,                      -- ICC-IMB report number
  threat_score    FLOAT DEFAULT 0,           -- Computed: recency + type severity
  h3_res5         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, geom, attack_type)
);

CREATE INDEX SMAPS_geom_idx ON smaps_incidents USING GIST (geom);
CREATE INDEX SMAPS_date_idx ON smaps_incidents (date DESC);
CREATE INDEX SMAPS_h3_idx ON smaps_incidents (h3_res5);

-- Threat score continuous aggregate (rolling 90-day piracy density)
CREATE MATERIALIZED VIEW IF NOT EXISTS smaps_threat_density AS
SELECT
  h3_res5,
  date_trunc('day', date) AS day,
  count(*) AS incident_count,
  max(threat_score) AS max_threat,
  ST_Centroid(ST_Collect(geom)) AS cluster_center
FROM smaps_incidents
WHERE date > NOW()::DATE - INTERVAL '90 days'
GROUP BY h3_res5, date_trunc('day', date)
WITH DATA;

-- Navigational warnings (polygons or buffers)
CREATE TABLE IF NOT EXISTS nav_warnings (
  id              SERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  geom            GEOMETRY(Geometry, 4326) NOT NULL,
  valid_from      TIMESTAMPTZ NOT NULL,
  valid_to        TIMESTAMPTZ,
  severity        TEXT,                    -- CRITICAL, WARNING, ADVISORY
  source_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX nav_warnings_geom_idx ON nav_warnings USING GIST (geom);
CREATE INDEX nav_warnings_valid_idx ON nav_warnings (valid_from, valid_to);
```

### Step 5: Update docker-compose.yml

```yaml
# In docker-compose.yml, modify infra_poller service:

  sovereign-infra-poller:
    build:
      context: ./backend/ingestion/infra_poller
      dockerfile: Dockerfile
    environment:
      KAFKA_BROKERS: ${KAFKA_BROKERS:-sovereign-redpanda:9092}
      REDIS_HOST: ${REDIS_HOST:-sovereign-redis}
      REDIS_PORT: ${REDIS_PORT:-6379}
      DATABASE_URL: ${DATABASE_URL}
      CENTER_LAT: ${CENTER_LAT}
      CENTER_LON: ${CENTER_LON}
      NDBC_POLL_INTERVAL_SECONDS: 900      # NEW: 15 minutes
      SMAPS_POLL_SCHEDULE: "0 15 * * MON-FRI"  # NEW: 15:00 ET weekdays
      LOG_LEVEL: ${LOG_LEVEL:-INFO}
    depends_on:
      - sovereign-redpanda
      - sovereign-timescaledb
      - sovereign-redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import redis; redis.Redis(host='${REDIS_HOST:-sovereign-redis}').ping()"]
      interval: 30s
      timeout: 10s
      retries: 3
    # Memory constraint (current ~150MB, adding ~60MB for NDBC+SMAPS)
    mem_limit: 256m
```

### Step 6: Update pyproject.toml (infra_poller)

```toml
# Add new dependencies to backend/ingestion/infra_poller/pyproject.toml

[project]
dependencies = [
    # ... existing dependencies ...
    "geopandas>=0.14.0",        # NEW: for SMAPS shapefile parsing
    "h3>=3.7.0",                # NEW: for H3 cell computation
    "pytz>=2023.3",             # NEW: for SMAPS schedule TZ handling
    # Existing: aiohttp, sqlalchemy, redis, psycopg2
]

[project.optional-dependencies]
dev = [
    # ... existing test deps ...
]
```

### Step 7: Update Test Suite

```python
# Add to backend/ingestion/infra_poller/tests/test_infra.py

import pytest
from datetime import datetime
from ..sources.ndbc import NDBCSource
from ..sources.SMAPS import SMAPSSource

class TestNDBCSource:
    """Test NDBC fetching and parsing."""

    async def test_parse_latest_obs(self, monkeypatch):
        """Test TSV parsing with mock data."""
        mock_text = """
#YY MM DD hh mm WVHT WSPD WDIR ...
41002 2026 03 28 12 00 2.5 5.3 120 ...
41004 2026 03 28 12 00 1.8 4.1 100 ...
"""
        ndbc = NDBCSource(None, None, None)
        obs = ndbc._parse_latest_obs(mock_text)

        assert len(obs) == 2
        assert obs['41002']['wvht_meters'] == 2.5
        assert obs['41004']['wspd_ms'] == 4.1

    def test_compute_threat_score(self):
        """Test SMAPS threat scoring logic."""
        from ..sources.SMAPS import SMAPSSource

        # Recent kidnapping: high score
        date_recent = (datetime.now().date())
        score = SMAPSSource._compute_threat_score('Kidnapping', date_recent)
        assert score == 30  # 10 * 3

        # Old armed robbery: low score
        date_old = (datetime.now().date() - timedelta(days=91))
        score = SMAPSSource._compute_threat_score('Armed Robbery', date_old)
        assert score == 0  # Outside 90-day window


class TestSMAPSSource:
    """Test SMAPS shapefile parsing."""

    async def test_parse_shapefile_sync(self, tmp_path):
        """Test shapefile ZIP extraction and geopandas parsing."""
        # Create mock shapefile ZIP (requires actual GIS test data)
        # For MVP: skip detailed test, rely on integration test
        pass
```

### Step 8: Update Dockerfile

```dockerfile
# backend/ingestion/infra_poller/Dockerfile

FROM python:3.12-slim

WORKDIR /app

# Add GDAL/geospatial dependencies for geopandas
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy pyproject.toml and install dependencies
COPY pyproject.toml uv.lock* ./
RUN pip install uv && uv pip install -e .

COPY . .

CMD ["python", "main.py"]
```

---

## Option A - Summary

| Aspect | Details |
|--------|---------|
| **Files Modified** | `main.py`, `pyproject.toml`, `Dockerfile`, `docker-compose.yml` |
| **Files Created** | `sources/ndbc.py`, `sources/smaps.py`, test expansions |
| **Database Changes** | 4 new tables + 2 continuous aggregates (ndbc_obs, smaps_incidents, nav_warnings) |
| **New Dependencies** | geopandas, h3, pytz |
| **Effort** | ~50 hours |
| **Container Changes** | 0 (extend existing infra_poller) |
| **Test Impact** | Extend `test_infra.py` (+2 new test classes, ~30 lines each) |
| **Memory Budget** | ~210 MB total (150 existing + 60 new) |
| **Caveats** | Requires GDAL system library; SMAPS schedule TZ-aware |

---

## Alternative: Option B (1 New Lightweight Poller for NOTAM)

If consolidating NOTAM into aviation_poller is deemed too invasive, create a dedicated NOTAM poller:

```
backend/ingestion/notam_poller/
├── main.py                         # Entry point
├── sources/
│   └── aviationweather.py          # AviationWeather.gov REST client
├── pyproject.toml                  # Minimal deps: aiohttp, sqlalchemy
├── Dockerfile
└── tests/
    └── test_notam.py               # Parser tests
```

**Effort**: ~25 hours (REST API, simpler than SMAPS shapefile)
**Container**: +1 (sovereign-notam-poller)
**Memory**: ~80 MB
**Schedule**: 5-min poll (vs SMAPS 1h)

---

## Recommendation Summary

| Option | NDBC | SMAPS | NOTAM | Containers | Total Effort | Go/No-Go |
|--------|------|------|-------|-----------|--------------|----------|
| **A: Extend infra_poller** | ✅ infra_poller | ✅ infra_poller | ❌ defer | +0 | ~50h | ✅ **RECOMMENDED** |
| **B: New maritime_data_poller** | ✅ maritime_data | ✅ maritime_data | ✅ maritime_data | +1 | ~60h | ✅ Alternative |
| **C: Extend all three** | aviation | infra | maritime | +0 | ~75h | ❌ Overcomplicates |

**Recommendation**: **Option A** — Extend infra_poller for NDBC + SMAPS, then defer NOTAM to Phase 2 (or create separate lightweight notam_poller if Phase 1 needs it).

This preserves clean separation of concerns (maritime infrastructure stays cohesive) while avoiding container proliferation.



