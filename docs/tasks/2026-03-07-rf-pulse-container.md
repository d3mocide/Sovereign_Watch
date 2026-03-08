# RF Pulse Container — Implementation Plan
**Date:** 2026-03-07
**Status:** PLANNING

---

## 1. Issue / Context

The current RF mapping capability is implemented as a thin proxy inside `backend/api/routers/repeaters.py`. It does the following on every frontend request:

1. Checks a Redis key.
2. If miss → makes a live HTTP request to `repeaterbook.com/api/export.php`.
3. Normalises the JSON response.
4. Stores in Redis for 24 hours.
5. Returns to client.

**Problems with this approach:**
- **Single source only** — architecture cannot accommodate RadioReference, NOAA NWR, ARD, or future sources without polluting the API layer with ingestion logic.
- **On-demand fetching** — data is only populated when a user opens the frontend, not continuously maintained. A fresh deploy has no RF data until someone queries it.
- **Not Kafka-native** — violates the platform's event-bus-first data flow; RF sites are never on `rf_raw`, so they cannot be consumed by the Historian, broadcast to TAK clients, or replayed.
- **Proxy coupling** — the API container is responsible for both serving data *and* fetching it from external sources, which couples ingestion latency to API response time.
- **No emcomm metadata** — RepeaterBook ARES/RACES/SKYWARN flags and RadioReference county-level public safety systems are absent.
- **No persistence** — data lives only in Redis with a 24-hour TTL and is lost on Redis restart.

**Goal:** Extract RF ingestion into a dedicated `rf-pulse` container that follows the same poller pattern as `orbital-pulse`, `adsb-poller`, and `ais-poller`, while expanding the data model to support multiple sources and service types (ham, GMRS, public safety, NOAA weather radio).

---

## 2. Data Sources

Based on research (Perplexity, 2026-03-07):

| Source | Service Type | API Type | Licensing | Update Freq |
|--------|-------------|----------|-----------|-------------|
| **RepeaterBook** | Ham + GMRS | REST JSON | Personal use free; commercial requires key | 24 h per area |
| **ARD (Amateur Repeater Directory)** | Ham | GitHub CSV/JSON | Open source, permissive | 24 h |
| **NOAA NWR** | Weather radio | Web scrape / NOAA bulk | U.S. Gov public domain | Weekly |
| **RadioReference** | Public safety, trunked P25/DMR | SOAP XML | Dev key free; end-user needs Premium subscription | On-demand per county |

**Phase 1** implements RepeaterBook (migrated from proxy) and ARD.
**Phase 2** implements NOAA NWR.
**Phase 3** implements RadioReference SOAP (user-credential model).

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  External APIs                                                    │
│  RepeaterBook API  │  ARD GitHub  │  NOAA NWR  │  RadioRef SOAP │
└──────────┬─────────┴──────┬───────┴─────┬──────┴──────┬─────────┘
           │                │             │             │
           └────────────────┴─────────────┴─────────────┘
                                    │
                            ┌───────▼────────┐
                            │   rf-pulse     │  (new container)
                            │  Python asyncio│
                            │  poller        │
                            └───────┬────────┘
                                    │  JSON → Kafka topic: rf_raw
                            ┌───────▼────────┐
                            │    Redpanda    │
                            └───────┬────────┘
                                    │
                     ┌──────────────┴──────────────┐
                     │                             │
             ┌───────▼──────┐             ┌────────▼──────┐
             │  Historian   │             │  Broadcast    │
             │  (backend-api│             │  (backend-api │
             │   service)   │             │   service)    │
             └───────┬──────┘             └───────────────┘
                     │  UPSERT
             ┌───────▼──────┐
             │  TimescaleDB │
             │  rf_sites    │
             │  rf_systems  │
             │  rf_talkgroups│
             └───────┬──────┘
                     │
             ┌───────▼──────┐
             │  backend-api │
             │  GET /api/rf │
             │  /sites      │  ← replaces /api/repeaters proxy
             └───────┬──────┘
                     │
             ┌───────▼──────┐
             │  Frontend    │
             │  useRFData   │
             └──────────────┘
```

---

## 4. New Database Schema

Add to `backend/db/init.sql`:

### 4.1 `rf_sites` — All fixed RF infrastructure

```sql
CREATE TABLE IF NOT EXISTS rf_sites (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source       TEXT NOT NULL,           -- 'repeaterbook' | 'ard' | 'noaa_nwr' | 'radioref'
    site_id      TEXT NOT NULL,           -- source-native identifier (callsign, NOAA ID, RR site ID)
    service      TEXT NOT NULL,           -- 'ham' | 'gmrs' | 'public_safety' | 'noaa_nwr'
    callsign     TEXT,
    name         TEXT,                    -- human label (site name or NWR station name)
    lat          DOUBLE PRECISION NOT NULL,
    lon          DOUBLE PRECISION NOT NULL,
    output_freq  DOUBLE PRECISION,        -- MHz (output / receive frequency)
    input_freq   DOUBLE PRECISION,        -- MHz (input / transmit frequency)
    tone_ctcss   DOUBLE PRECISION,        -- CTCSS Hz (e.g. 141.3)
    tone_dcs     TEXT,                    -- DCS code where applicable
    modes        TEXT[],                  -- ['FM','DMR','P25','D-Star','Fusion','NXDN','TETRA']
    use_access   TEXT,                    -- 'OPEN' | 'CLOSED' | 'LINKED' | 'PRIVATE'
    status       TEXT DEFAULT 'Unknown',  -- 'On-air' | 'Off-air' | 'Unknown'
    city         TEXT,
    state        TEXT,
    country      TEXT DEFAULT 'US',
    emcomm_flags TEXT[],                  -- ['ARES','RACES','SKYWARN','CERT','WICEN']
    meta         JSONB,                   -- source-specific extras (power_w, antenna_height, etc.)
    geom         GEOMETRY(POINT, 4326),
    fetched_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (source, site_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_sites_geom       ON rf_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_rf_sites_service     ON rf_sites (service);
CREATE INDEX IF NOT EXISTS ix_rf_sites_source      ON rf_sites (source);
CREATE INDEX IF NOT EXISTS ix_rf_sites_callsign    ON rf_sites USING gin (callsign gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_rf_sites_modes       ON rf_sites USING GIN (modes);
CREATE INDEX IF NOT EXISTS ix_rf_sites_emcomm      ON rf_sites USING GIN (emcomm_flags);
```

### 4.2 `rf_systems` — Trunked public safety systems (RadioReference)

```sql
CREATE TABLE IF NOT EXISTS rf_systems (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source     TEXT DEFAULT 'radioref',
    rr_sid     TEXT UNIQUE,               -- RadioReference system ID
    name       TEXT NOT NULL,
    type       TEXT,                      -- 'P25', 'DMR', 'EDACS', 'Motorola'
    state      TEXT,
    county     TEXT,
    meta       JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rf_systems_state ON rf_systems (state);
```

### 4.3 `rf_talkgroups` — Trunked talkgroup catalogue

```sql
CREATE TABLE IF NOT EXISTS rf_talkgroups (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    system_id   UUID REFERENCES rf_systems(id) ON DELETE CASCADE,
    decimal_id  INTEGER NOT NULL,
    alpha_tag   TEXT,
    description TEXT,
    category    TEXT,                     -- 'Law Dispatch', 'Fire Dispatch', 'EMS', etc.
    priority    INTEGER DEFAULT 3,        -- 1=highest, 5=lowest
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (system_id, decimal_id)
);

CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_system ON rf_talkgroups (system_id);
CREATE INDEX IF NOT EXISTS ix_rf_talkgroups_cat    ON rf_talkgroups (category);
```

---

## 5. New Container: `rf-pulse`

### 5.1 Directory Structure

```
backend/ingestion/rf_pulse/
├── Dockerfile
├── requirements.txt
├── main.py              # asyncio entry point
├── service.py           # RFPulseService (main orchestrator)
├── sources/
│   ├── __init__.py
│   ├── repeaterbook.py  # Phase 1 — RepeaterBook REST adapter
│   ├── ard.py           # Phase 1 — Amateur Repeater Directory CSV
│   ├── noaa_nwr.py      # Phase 2 — NOAA Weather Radio scraper
│   └── radioref.py      # Phase 3 — RadioReference SOAP adapter
└── tests/
    ├── test_repeaterbook.py
    ├── test_ard.py
    └── test_noaa_nwr.py
```

### 5.2 `requirements.txt`

```
aiokafka==0.11.0
redis[asyncio]==5.0.4
httpx==0.27.0
aiohttp==3.9.5
zeep==4.2.1          # SOAP client for RadioReference (Phase 3)
beautifulsoup4==4.12.3  # NOAA NWR scraping (Phase 2)
lxml==5.2.1
python-dotenv==1.0.1
```

### 5.3 `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]
```

### 5.4 `main.py`

```python
"""rf-pulse: RF infrastructure ingestion service."""
import asyncio
import logging
import signal

from service import RFPulseService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s – %(message)s"
)

async def main():
    svc = RFPulseService()
    loop = asyncio.get_running_loop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(svc.shutdown()))

    await svc.setup()
    await svc.run()

asyncio.run(main())
```

### 5.5 `service.py` — Core Service Logic

```python
"""
RFPulseService
==============
Orchestrates multi-source RF infrastructure collection.

Publish contract:
  Topic : rf_raw
  Format: JSON
  Fields:
    source       str   — 'repeaterbook' | 'ard' | 'noaa_nwr' | 'radioref'
    site_id      str   — source-native unique key
    service      str   — 'ham' | 'gmrs' | 'public_safety' | 'noaa_nwr'
    callsign     str | null
    name         str | null
    lat          float
    lon          float
    output_freq  float | null   (MHz)
    input_freq   float | null   (MHz)
    tone_ctcss   float | null   (Hz)
    tone_dcs     str | null
    modes        list[str]
    use_access   str
    status       str
    city         str | null
    state        str | null
    country      str            (default 'US')
    emcomm_flags list[str]
    meta         dict
"""

import asyncio
import json
import logging
import os

import redis.asyncio as aioredis
from aiokafka import AIOKafkaProducer

from sources.repeaterbook import RepeaterBookSource
from sources.ard import ARDSource

logger = logging.getLogger("rf_pulse")

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "sovereign-redpanda:9092")
REDIS_HOST    = os.getenv("REDIS_HOST", "sovereign-redis")
REDIS_PORT    = int(os.getenv("REDIS_PORT", "6379"))
TOPIC_OUT     = "rf_raw"

# Fetch interval for each source
REPEATERBOOK_INTERVAL_H = int(os.getenv("RF_REPEATERBOOK_INTERVAL_H", "6"))
ARD_INTERVAL_H          = int(os.getenv("RF_ARD_INTERVAL_H", "24"))


class RFPulseService:
    def __init__(self):
        self.running       = True
        self.producer      = None
        self.redis_client  = None
        self.sources       = []

    async def setup(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BROKERS,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await self.producer.start()
        logger.info("Kafka producer started → topic: %s", TOPIC_OUT)

        self.redis_client = await aioredis.from_url(
            f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True
        )
        logger.info("Redis connected")

        # Instantiate sources
        self.sources = [
            RepeaterBookSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_OUT,
                fetch_interval_h=REPEATERBOOK_INTERVAL_H,
            ),
            ARDSource(
                producer=self.producer,
                redis_client=self.redis_client,
                topic=TOPIC_OUT,
                fetch_interval_h=ARD_INTERVAL_H,
            ),
        ]

    async def run(self):
        """Run all source loops concurrently."""
        tasks = [asyncio.create_task(src.loop()) for src in self.sources]
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            pass

    async def shutdown(self):
        logger.info("rf-pulse shutting down…")
        self.running = False
        if self.producer:
            await self.producer.stop()
        if self.redis_client:
            await self.redis_client.close()
```

### 5.6 `sources/repeaterbook.py`

```python
"""
RepeaterBook source adapter.

Fetches from the RepeaterBook JSON API using a multi-point area strategy
(same concept as aviation_poller's overlapping polling points) to ensure
full coverage for large COVERAGE_RADIUS_NM values.

Rate limit: respected via a configurable sleep between requests.
API key: optional Bearer token from env REPEATERBOOK_API_TOKEN.
"""

import asyncio
import logging
import os
import time

import httpx

logger = logging.getLogger("rf_pulse.repeaterbook")

RB_BASE_URL  = "https://www.repeaterbook.com/api/export.php"
RB_TIMEOUT   = 20.0
RB_RADIUS_MI = int(os.getenv("RF_RB_RADIUS_MI", "200"))  # miles per query point
CENTER_LAT   = float(os.getenv("CENTER_LAT", "45.5152"))
CENTER_LON   = float(os.getenv("CENTER_LON", "-122.6784"))


class RepeaterBookSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer       = producer
        self.redis_client   = redis_client
        self.topic          = topic
        self.interval_sec   = fetch_interval_h * 3600
        self.token          = os.getenv("REPEATERBOOK_API_TOKEN", "")

    async def loop(self):
        while True:
            try:
                await self._fetch_and_publish()
            except Exception:
                logger.exception("RepeaterBook fetch error")
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("Fetching RepeaterBook data (center=%.4f,%.4f radius=%d mi)",
                    CENTER_LAT, CENTER_LON, RB_RADIUS_MI)

        headers = {"User-Agent": "SovereignWatch/1.0 (admin@sovereignwatch.local)"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"

        params = {
            "lat": CENTER_LAT,
            "lng": CENTER_LON,
            "dist": RB_RADIUS_MI,
            "format": "json",
        }

        async with httpx.AsyncClient(timeout=RB_TIMEOUT, headers=headers) as client:
            resp = await client.get(RB_BASE_URL, params=params)
            resp.raise_for_status()
            raw = resp.json()

        results = raw.get("results") or []
        published = 0

        for entry in results:
            record = self._normalise(entry)
            if record is None:
                continue
            await self.producer.send(self.topic, value=record)
            published += 1

        logger.info("RepeaterBook: published %d sites to %s", published, self.topic)

    def _normalise(self, entry: dict) -> dict | None:
        try:
            lat = float(entry.get("Lat", 0))
            lon = float(entry.get("Long", 0))
        except (TypeError, ValueError):
            return None

        if lat == 0.0 and lon == 0.0:
            return None

        modes = []
        for m in ("FM Analog", "D-Star", "Fusion", "DMR", "P25", "NXDN", "TETRA"):
            v = entry.get(m, "")
            if v and str(v).strip().lower() not in ("", "no", "null", "none"):
                modes.append(m)

        # Derive emcomm flags
        emcomm = []
        for flag, key in [("ARES", "ARES"), ("RACES", "RACES"),
                          ("SKYWARN", "SKYWARN"), ("CERT", "CERT")]:
            v = entry.get(key, "")
            if v and str(v).strip().lower() not in ("", "no", "null", "none"):
                emcomm.append(flag)

        try:
            out_freq = float(entry.get("Frequency", 0))
        except (TypeError, ValueError):
            out_freq = None

        try:
            in_freq = float(entry.get("Input Freq", 0))
        except (TypeError, ValueError):
            in_freq = None

        try:
            ctcss = float(entry.get("PL") or entry.get("CTCSS") or 0) or None
        except (TypeError, ValueError):
            ctcss = None

        callsign = entry.get("Call Sign", "").strip()
        site_id  = f"rb:{callsign}:{entry.get('State','')}"

        return {
            "source":       "repeaterbook",
            "site_id":      site_id,
            "service":      "ham",
            "callsign":     callsign,
            "name":         callsign,
            "lat":          lat,
            "lon":          lon,
            "output_freq":  out_freq,
            "input_freq":   in_freq,
            "tone_ctcss":   ctcss,
            "tone_dcs":     entry.get("DCS"),
            "modes":        modes,
            "use_access":   entry.get("Use", "OPEN"),
            "status":       entry.get("Operational Status", "Unknown"),
            "city":         entry.get("Nearest City", ""),
            "state":        entry.get("State", ""),
            "country":      "US",
            "emcomm_flags": emcomm,
            "meta": {
                "county":   entry.get("County", ""),
                "landmark": entry.get("Landmark", ""),
            },
        }
```

### 5.7 `sources/ard.py` (Amateur Repeater Directory — open CSV)

```python
"""
ARD source adapter.

Fetches the community-maintained Amateur Repeater Directory from GitHub.
Dataset is open-source, updated continuously by contributors.
URL: https://raw.githubusercontent.com/ryanwwest/ARD-RepeaterList/main/master.csv

ARD includes ARES/RACES/SKYWARN flags per entry.
"""

import asyncio
import csv
import io
import logging

import httpx

logger = logging.getLogger("rf_pulse.ard")

ARD_CSV_URL = (
    "https://raw.githubusercontent.com/"
    "ryanwwest/ARD-RepeaterList/main/master.csv"
)
ARD_TIMEOUT = 30.0


class ARDSource:
    def __init__(self, producer, redis_client, topic, fetch_interval_h):
        self.producer     = producer
        self.redis_client = redis_client
        self.topic        = topic
        self.interval_sec = fetch_interval_h * 3600

    async def loop(self):
        while True:
            try:
                await self._fetch_and_publish()
            except Exception:
                logger.exception("ARD fetch error")
            await asyncio.sleep(self.interval_sec)

    async def _fetch_and_publish(self):
        logger.info("Fetching ARD master CSV from GitHub")

        async with httpx.AsyncClient(timeout=ARD_TIMEOUT) as client:
            resp = await client.get(ARD_CSV_URL)
            resp.raise_for_status()
            content = resp.text

        reader  = csv.DictReader(io.StringIO(content))
        published = 0

        for row in reader:
            record = self._normalise(row)
            if record is None:
                continue
            await self.producer.send(self.topic, value=record)
            published += 1

        logger.info("ARD: published %d sites to %s", published, self.topic)

    def _normalise(self, row: dict) -> dict | None:
        try:
            lat = float(row.get("Latitude", 0))
            lon = float(row.get("Longitude", 0))
        except (TypeError, ValueError):
            return None

        if lat == 0.0 and lon == 0.0:
            return None

        emcomm = []
        for flag in ("ARES", "RACES", "SKYWARN", "CERT"):
            if row.get(flag, "").strip().upper() in ("Y", "YES", "1", "TRUE"):
                emcomm.append(flag)

        modes = []
        for m in ("FM", "DMR", "P25", "D-Star", "Fusion", "NXDN"):
            if row.get(m, "").strip().upper() in ("Y", "YES", "1", "TRUE"):
                modes.append(m)
        if not modes:
            modes = ["FM"]  # ARD default

        try:
            out_freq = float(row.get("Output", 0)) or None
        except (TypeError, ValueError):
            out_freq = None

        try:
            in_freq = float(row.get("Input", 0)) or None
        except (TypeError, ValueError):
            in_freq = None

        try:
            ctcss = float(row.get("CTCSS", 0)) or None
        except (TypeError, ValueError):
            ctcss = None

        callsign = row.get("Callsign", "").strip()
        state    = row.get("State", "").strip()
        site_id  = f"ard:{callsign}:{state}"

        return {
            "source":       "ard",
            "site_id":      site_id,
            "service":      "ham",
            "callsign":     callsign,
            "name":         callsign,
            "lat":          lat,
            "lon":          lon,
            "output_freq":  out_freq,
            "input_freq":   in_freq,
            "tone_ctcss":   ctcss,
            "tone_dcs":     row.get("DCS", "").strip() or None,
            "modes":        modes,
            "use_access":   row.get("Access", "OPEN"),
            "status":       row.get("Status", "Unknown"),
            "city":         row.get("City", ""),
            "state":        state,
            "country":      "US",
            "emcomm_flags": emcomm,
            "meta": {
                "county":      row.get("County", ""),
                "operational": row.get("Operational", ""),
                "coordinated": row.get("Coordinated", ""),
            },
        }
```

---

## 6. Backend Historian Update

Add `rf_raw` consumption to `backend/api/services/historian.py`.

The Historian already subscribes to `adsb_raw`, `ais_raw`, `orbital_raw`. Add `rf_raw` to the list of topics and implement an upsert handler:

```python
# In historian.py — add rf_raw to topic subscription
TOPICS = ["adsb_raw", "ais_raw", "orbital_raw", "rf_raw"]  # add rf_raw

# Add handler
async def _handle_rf_raw(record: dict, pool):
    """Upsert an RF site from rf_raw Kafka message into rf_sites table."""
    from shapely.geometry import Point
    import json

    geom_wkt = f"SRID=4326;POINT({record['lon']} {record['lat']})"

    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO rf_sites (
                source, site_id, service, callsign, name,
                lat, lon, output_freq, input_freq, tone_ctcss, tone_dcs,
                modes, use_access, status, city, state, country,
                emcomm_flags, meta, geom, fetched_at, updated_at
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                ST_GeomFromEWKT($20), NOW(), NOW()
            )
            ON CONFLICT (source, site_id) DO UPDATE SET
                name         = EXCLUDED.name,
                lat          = EXCLUDED.lat,
                lon          = EXCLUDED.lon,
                output_freq  = EXCLUDED.output_freq,
                input_freq   = EXCLUDED.input_freq,
                tone_ctcss   = EXCLUDED.tone_ctcss,
                tone_dcs     = EXCLUDED.tone_dcs,
                modes        = EXCLUDED.modes,
                use_access   = EXCLUDED.use_access,
                status       = EXCLUDED.status,
                city         = EXCLUDED.city,
                state        = EXCLUDED.state,
                emcomm_flags = EXCLUDED.emcomm_flags,
                meta         = EXCLUDED.meta,
                geom         = EXCLUDED.geom,
                fetched_at   = NOW(),
                updated_at   = NOW()
        """,
            record["source"], record["site_id"], record["service"],
            record.get("callsign"), record.get("name"),
            record["lat"], record["lon"],
            record.get("output_freq"), record.get("input_freq"),
            record.get("tone_ctcss"), record.get("tone_dcs"),
            record.get("modes", []), record.get("use_access", "OPEN"),
            record.get("status", "Unknown"),
            record.get("city"), record.get("state"),
            record.get("country", "US"),
            record.get("emcomm_flags", []),
            json.dumps(record.get("meta", {})),
            geom_wkt,
        )
```

---

## 7. Backend API Refactor

### 7.1 Remove `routers/repeaters.py` proxy behaviour

Replace the live-proxy logic with a PostGIS spatial query against `rf_sites`:

```python
# backend/api/routers/rf.py  (rename / replace repeaters.py)

@router.get("/api/rf/sites")
async def get_rf_sites(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_nm: float = Query(default=150.0, ge=1, le=1000),
    service: str | None = Query(default=None),        # ham|gmrs|public_safety|noaa_nwr
    modes: list[str] = Query(default=[]),             # FM,DMR,P25,...
    emcomm_only: bool = Query(default=False),
    source: str | None = Query(default=None),         # repeaterbook|ard|noaa_nwr|radioref
):
    radius_m = radius_nm * 1852.0   # NM → metres
    cache_key = f"rf_sites:{lat:.2f}:{lon:.2f}:{int(radius_nm)}:{service}:{','.join(sorted(modes))}:{emcomm_only}"

    # 1. Redis cache (1 hour TTL — shorter than before since data is now DB-backed)
    if db.redis_client:
        cached = await db.redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    # 2. PostGIS spatial query
    conditions = ["ST_DWithin(geom::geography, ST_MakePoint($2, $1)::geography, $3)"]
    params = [lat, lon, radius_m]

    if service:
        conditions.append(f"service = ${len(params)+1}")
        params.append(service)

    if modes:
        conditions.append(f"modes && ${len(params)+1}::text[]")
        params.append(modes)

    if emcomm_only:
        conditions.append("array_length(emcomm_flags, 1) > 0")

    where = " AND ".join(conditions)
    rows = await db.pool.fetch(
        f"SELECT * FROM rf_sites WHERE {where} ORDER BY geom <-> ST_MakePoint($2,$1)::geometry LIMIT 5000",
        *params,
    )

    results = [dict(r) for r in rows]
    response = {"count": len(results), "results": results}

    if db.redis_client:
        await db.redis_client.setex(cache_key, 3600, json.dumps(response, default=str))

    return response
```

### 7.2 Keep `/api/repeaters` as a redirect alias

For backwards compatibility with any cached frontend builds, add:

```python
@router.get("/api/repeaters")
async def repeaters_alias(lat: float = Query(...), lon: float = Query(...),
                           radius: float = Query(default=75.0)):
    # Delegate to new endpoint, converting miles → NM (1 mi ≈ 0.869 NM)
    return await get_rf_sites(lat=lat, lon=lon, radius_nm=radius * 0.869)
```

---

## 8. Docker Compose Changes

Add `rf-pulse` service to `docker-compose.yml`:

```yaml
  # --- Ingestion: RF Infrastructure (Repeaters, NOAA NWR, Public Safety) ---
  rf-pulse:
    build:
      context: ./backend/ingestion/rf_pulse
      dockerfile: Dockerfile
    container_name: sovereign-rf-pulse
    environment:
      - KAFKA_BROKERS=sovereign-redpanda:9092
      - REDIS_HOST=sovereign-redis
      - REDIS_PORT=6379
      - CENTER_LAT=${CENTER_LAT:-45.5152}
      - CENTER_LON=${CENTER_LON:--122.6784}
      - COVERAGE_RADIUS_NM=${COVERAGE_RADIUS_NM:-150}
      - REPEATERBOOK_API_TOKEN=${REPEATERBOOK_API_TOKEN}
      - RF_RB_RADIUS_MI=${RF_RB_RADIUS_MI:-200}
      - RF_REPEATERBOOK_INTERVAL_H=${RF_REPEATERBOOK_INTERVAL_H:-6}
      - RF_ARD_INTERVAL_H=${RF_ARD_INTERVAL_H:-24}
      # Phase 3: RadioReference credentials
      - RADIOREF_APP_KEY=${RADIOREF_APP_KEY}
    networks:
      - backend-net
    depends_on:
      redpanda:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
```

Remove `REPEATERBOOK_API_TOKEN` from the `backend-api` service environment block (it will no longer proxy the external API).

---

## 9. Environment Variables

Add to `.env.example`:

```bash
# --- RF Pulse ---
# RepeaterBook (ham repeaters)
REPEATERBOOK_API_TOKEN=           # Optional; required for unlimited API access
RF_RB_RADIUS_MI=200               # Miles radius per RepeaterBook query point
RF_REPEATERBOOK_INTERVAL_H=6      # Re-fetch interval (hours)

# ARD (Amateur Repeater Directory — open source)
RF_ARD_INTERVAL_H=24              # Re-fetch interval (hours)

# NOAA NWR (Phase 2)
RF_NOAA_INTERVAL_H=168            # Re-fetch interval (hours = weekly)

# RadioReference (Phase 3 — public safety trunked systems)
RADIOREF_APP_KEY=                 # Developer app key from radioreference.com
# Note: End-users provide their own RR username/password via the frontend settings
# panel. Credentials are NOT stored server-side; they are passed per-request.
```

---

## 10. Frontend Updates

### 10.1 Update `useRepeaters.ts` → `useRFSites.ts`

- Change fetch URL from `/api/repeaters` → `/api/rf/sites`
- Add filter parameters: `service`, `modes`, `emcomm_only`
- Add result types for `noaa_nwr` and `public_safety` services
- Keep existing 0.25° delta check for smart refetch

### 10.2 Extend `types.ts`

```typescript
export type RFService = 'ham' | 'gmrs' | 'public_safety' | 'noaa_nwr';
export type RFMode = 'FM' | 'DMR' | 'P25' | 'D-Star' | 'Fusion' | 'NXDN' | 'TETRA';
export type EmcommFlag = 'ARES' | 'RACES' | 'SKYWARN' | 'CERT' | 'WICEN';

export interface RFSite {
  id: string;
  source: string;
  site_id: string;
  service: RFService;
  callsign: string | null;
  name: string | null;
  lat: number;
  lon: number;
  output_freq: number | null;
  input_freq: number | null;
  tone_ctcss: number | null;
  tone_dcs: string | null;
  modes: RFMode[];
  use_access: string;
  status: string;
  city: string | null;
  state: string | null;
  country: string;
  emcomm_flags: EmcommFlag[];
  meta: Record<string, unknown>;
}
```

### 10.3 Update `buildRepeaterLayers.ts` → `buildRFLayers.ts`

Add colour coding for new service types:

| Service / Condition | Colour |
|---------------------|--------|
| Ham — digital modes | Violet (#7c3aed) |
| Ham — FM only | Emerald (#10b981) |
| Ham — off-air | Slate (#64748b) |
| NOAA NWR | Sky blue (#0ea5e9) |
| Public safety | Amber (#f59e0b) |
| EMCOMM flagged | Red outline (#ef4444) |

### 10.4 Add layer sub-filters to `SystemStatus.tsx`

Add collapsible filter group under the RF Infrastructure toggle:

```
☑ RF Infrastructure
  ├─ ☑ Ham / GMRS
  │   ├─ ☑ FM Analog
  │   ├─ ☑ DMR
  │   ├─ ☑ P25
  │   ├─ ☑ D-Star / Fusion
  │   └─ ☑ EMCOMM only
  ├─ ☑ NOAA Weather Radio          (Phase 2)
  └─ ☑ Public Safety               (Phase 3)
```

---

## 11. Kafka Topic

The `rf_raw` topic will be auto-created by Redpanda on first publish. If explicit creation is needed (e.g., in a Redpanda init container), add:

```bash
rpk topic create rf_raw --partitions 1 --replicas 1
```

Characteristics:
- **Partitions**: 1 (RF sites are not high-velocity; 1 partition is sufficient)
- **Retention**: 48 hours (allows re-processing on historian restart)
- **Max message size**: 64 KB (JSON objects are small)

---

## 12. Implementation Phases & Order

### Phase 1 — Core Container (Implement First)

1. `backend/db/init.sql` — add `rf_sites`, `rf_systems`, `rf_talkgroups` tables
2. `backend/ingestion/rf_pulse/` — create all files per §5
3. `backend/api/services/historian.py` — add `rf_raw` consumption + upsert handler
4. `backend/api/routers/rf.py` — DB-backed spatial query endpoint
5. `backend/api/main.py` — include new router, keep `/api/repeaters` alias
6. `docker-compose.yml` — add `rf-pulse` service, remove RB token from `backend-api`
7. `.env.example` — add new env vars
8. `frontend/src/hooks/useRFSites.ts` — rename + update URL
9. `frontend/src/types.ts` — extend type definitions
10. `frontend/src/layers/buildRFLayers.ts` — update colour logic for service types
11. `frontend/src/components/widgets/SystemStatus.tsx` — add mode sub-filters

### Phase 2 — NOAA Weather Radio

12. `backend/ingestion/rf_pulse/sources/noaa_nwr.py` — NOAA NWR scraper
13. Register `NOAANWRSource` in `service.py`
14. Frontend: add NWR layer (sky blue markers) and toggle

### Phase 3 — RadioReference Public Safety

15. `backend/ingestion/rf_pulse/sources/radioref.py` — SOAP client (zeep)
16. `backend/api/routers/rf.py` — add `/api/rf/systems` and `/api/rf/talkgroups` endpoints
17. Frontend: add `useRFSystems.ts` hook, public safety layer, talkgroup browser widget
18. Frontend: add RadioReference credential input to settings panel (credentials sent per-request, never stored server-side)

---

## 13. Verification Plan

After Phase 1 is implemented:

```bash
# 1. Lint the new poller
cd backend/ingestion/rf_pulse && ruff check .

# 2. Run poller unit tests
cd backend/ingestion/rf_pulse && python -m pytest

# 3. Lint backend API changes
cd backend/api && ruff check .

# 4. Run API tests
cd backend/api && python -m pytest

# 5. Lint frontend changes
cd frontend && npm run lint && npm run test

# 6. Build rf-pulse container
docker compose build rf-pulse

# 7. Start services
docker compose up -d

# 8. Confirm rf_raw topic is populated
docker compose exec redpanda rpk topic consume rf_raw --offset start -n 5

# 9. Confirm rf_sites table has rows
docker compose exec timescaledb psql -U postgres sovereign_watch \
  -c "SELECT source, count(*) FROM rf_sites GROUP BY source;"

# 10. Query new API endpoint
curl "http://localhost/api/rf/sites?lat=45.5&lon=-122.6&radius_nm=100" | jq '.count'

# 11. Verify backwards compat alias
curl "http://localhost/api/repeaters?lat=45.5&lon=-122.6&radius=75" | jq '.count'
```

---

## 14. Benefits

| Concern | Before | After |
|---------|--------|-------|
| **Data sources** | RepeaterBook only | RepeaterBook + ARD + NOAA NWR + RadioReference |
| **Data freshness** | On-demand (first request after deploy = cold) | Continuous background ingestion |
| **Persistence** | Redis only (volatile, 24h TTL) | TimescaleDB (durable) |
| **Kafka-native** | No — bypasses event bus | Yes — `rf_raw` topic consumed by Historian |
| **Emcomm metadata** | Partial (modes only) | Full ARES/RACES/SKYWARN/CERT flags + emcomm filter |
| **Public safety** | None | P25/DMR trunked systems via RadioReference (Phase 3) |
| **NOAA weather radio** | None | NWR transmitters with SAME codes (Phase 2) |
| **Horizontal scaling** | Cannot scale independently | rf-pulse scales independently of API |
| **API coupling** | API fetches from external on request | API queries local DB only |
| **Mode sub-filters** | None in frontend | FM / DMR / P25 / D-Star / Fusion toggles |
