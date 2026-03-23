# API Reference — Sovereign Watch Fusion API

> **Base URL:** `http://localhost/api` (via Nginx reverse proxy)
> **Direct (internal):** `http://sovereign-backend:8000`
> **Interactive Docs:** `http://localhost/api/docs` (Swagger UI)
> **Framework:** FastAPI (Python)

---

## Authentication

The API currently does not require authentication tokens. It is designed to run on a local trusted network. Ensure Nginx is not exposed directly to the public internet without adding an authentication layer.

---

## Endpoints

### Health Check

#### `GET /health`

Returns a simple liveness check.

**Response:**
```json
{ "status": "ok" }
```

---

## Tracks

### `WebSocket /api/tracks/live`

**Real-time entity stream.** Connect to receive all entity position updates as they arrive from the Redpanda Kafka bus.

```
ws://localhost/api/tracks/live
```

**Message Format:** Each message is a JSON string containing a TAK event (see [TAK Protocol Reference](./TAK_Protocol.md)):

```json
{
  "uid": "a1b2c3",
  "type": "a-f-A-C-F",
  "how": "m-g",
  "time": 1710000000000,
  "start": "2026-03-12T18:00:00Z",
  "stale": "2026-03-12T18:02:00Z",
  "point": { "lat": 45.52, "lon": -122.68, "hae": 10668, "ce": 10, "le": 10 },
  "detail": { "contact": { "callsign": "UAL123" }, "track": { "course": 270, "speed": 245 } }
}
```

- The WebSocket connection receives **all entity domains** (aviation, maritime, orbital, RF) as a unified stream.
- Client-side filtering by domain/type is performed in the frontend layer selection logic.
- The connection is broadcast — no subscription filtering is available at the WebSocket level.

---

### `GET /api/tracks/history/{entity_id}`

Returns historical track points for a specific entity.

**Path Parameters:**
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `entity_id` | string | Entity UID (e.g., ICAO hex `a1b2c3`, MMSI `123456789`, or `SAT-25544` for a satellite) |

**Query Parameters:**
| Parameter | Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `limit` | int | `100` | 1 – MAX_LIMIT | Maximum number of track points to return |
| `hours` | int | `24` | 1 – MAX_HOURS | Lookback window in hours |

> **Data source routing:** Aircraft and vessel entities (`entity_id` not starting with `SAT-`)
> are served from the `tracks` hypertable (72-hour retention). Satellite entities
> (`SAT-*`) have no stored position history — positions are computed on-demand via
> SGP4 from the current TLE in the `satellites` table.  The `hours` and `limit`
> parameters control the time window and point density of the computed track.

**Response:** Array of track objects ordered by time descending:
```json
[
  {
    "time": "2026-03-12T17:45:00Z",
    "lat": 45.52,
    "lon": -122.68,
    "alt": 10668.0,
    "speed": 245.3,
    "heading": 270.5,
    "meta": { "callsign": "UAL123", "classification": { ... } }
  }
]
```

> **Note:** For satellite entities (`SAT-*`), `meta` is always `null`. Satellite
> metadata (name, category, constellation, TLE) is available via
> `GET /api/orbital/passes` and `GET /api/orbital/groundtrack/{norad_id}`.

---

### `GET /api/tracks/search`

Search for entities by UID or callsign (substring match).

**Query Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `q` | string | *(required)* | Search query (min 2 chars, max 100 chars) |
| `limit` | int | `10` | Maximum results |

**Response:** Array of most-recent-position objects per matched entity:
```json
[
  {
    "entity_id": "a1b2c3",
    "type": "a-f-A-C-F",
    "last_seen": "2026-03-12T17:45:00Z",
    "lat": 45.52,
    "lon": -122.68,
    "callsign": "UAL123",
    "classification": { "platform": "fixed_wing", "affiliation": "civilian" }
  }
]
```

> **Satellite results:** Matches are sourced directly from the `satellites` TLE
> catalogue by `('SAT-' || norad_id) ILIKE` or `name ILIKE`.  `callsign` is the
> satellite name, `classification` is always `null`, and the `lat`/`lon` fields
> reflect the current computed position (SGP4 propagated at query time).  Both
> `tracks` and `satellites` are searched in parallel and results are combined.

---

### `GET /api/tracks/replay`

Retrieve all track points within a time window for historical replay.

**Query Parameters:**
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `start` | string | ISO 8601 start timestamp (e.g., `2026-03-12T10:00:00Z`) |
| `end` | string | ISO 8601 end timestamp |
| `limit` | int | Maximum track points (default: 1000, max: MAX_REPLAY_LIMIT) |

**Constraints:**
- `end` must be after `start`
- Time window cannot exceed `MAX_REPLAY_HOURS`

> **Data source:** Results are a UNION of `tracks` (72-hour retention) and
> the `tracks` hypertable. Satellite track points older than 72 hours (ADS-B/AIS)
> will not appear in replay results.

**Response:** Array of track points ordered by time ascending, including all entity types within the time window. Satellite rows (`type: "a-s-K"`) always have `meta: null`:
```json
[
  {
    "time": "2026-03-12T10:00:05Z",
    "entity_id": "a1b2c3",
    "type": "a-f-A-C-F",
    "lat": 45.50,
    "lon": -122.70,
    "alt": 9144.0,
    "speed": 238.0,
    "heading": 265.0,
    "meta": { "callsign": "UAL123", "classification": { ... } }
  },
  {
    "time": "2026-03-12T10:00:10Z",
    "entity_id": "SAT-25544",
    "type": "a-s-K",
    "lat": 51.50,
    "lon": -0.12,
    "alt": 418000.0,
    "speed": 7660.0,
    "heading": 42.1,
    "meta": null
  }
]
```

---

## Analysis (AI Fusion)

### `POST /api/analyze/{uid}`

Performs AI-powered tactical analysis on a track entity using the configured LLM.

**Path Parameters:**
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `uid` | string | Entity UID to analyze |

**Request Body:**
```json
{
  "lookback_hours": 6
}
```

**Response:** Server-Sent Events (SSE) stream — the AI assessment is streamed token-by-token.

```
data: Based on the telemetry data for entity a1b2c3 (UAL123)...
data: The aircraft maintained a consistent westbound heading...
data: No anomalies detected.
```

**Available AI Models** (configured via `/api/config/ai`):
| Model ID | Label | Provider |
| :--- | :--- | :--- |
| `deep-reasoner` | Claude 3.5 Sonnet | Anthropic (cloud) |
| `public-flash` | Gemini 1.5 Flash | Google (cloud) |
| `secure-core` | LLaMA3 (Ollama) | Local |

---

## System Configuration

### `GET /api/config/location`

Get the current active surveillance area (AOR).

**Response:**
```json
{
  "lat": 45.5152,
  "lon": -122.6784,
  "radius_nm": 150,
  "updated_at": "2026-03-12T18:00:00Z"
}
```

If not previously set, returns the `CENTER_LAT` / `CENTER_LON` / `COVERAGE_RADIUS_NM` defaults from the environment.

---

### `POST /api/config/location`

Update the active surveillance area. Immediately notifies all pollers via Redis pub/sub.

**Request Body:**
```json
{
  "lat": 38.8977,
  "lon": -77.0365,
  "radius_nm": 100
}
```

**Constraints:** `lat` ∈ [-90, 90], `lon` ∈ [-180, 180], `radius_nm` ∈ [10, 300]

**Response:**
```json
{
  "status": "ok",
  "active_mission": { "lat": 38.8977, "lon": -77.0365, "radius_nm": 100 }
}
```

---

### `GET /api/config/ai`

Returns available AI models and the currently active selection.

**Response:**
```json
{
  "active_model": "deep-reasoner",
  "available_models": [
    { "id": "deep-reasoner", "label": "Claude 3.5 Sonnet", "provider": "Anthropic", "local": false },
    { "id": "public-flash",  "label": "Gemini 1.5 Flash",  "provider": "Google",    "local": false },
    { "id": "secure-core",   "label": "LLaMA3 (Ollama)",   "provider": "Local",     "local": true  }
  ]
}
```

---

### `POST /api/config/ai`

Switch the active AI model.

**Request Body:**
```json
{ "model_id": "secure-core" }
```

**Valid model IDs:** `deep-reasoner`, `public-flash`, `secure-core`

---

### `GET /api/config/features`

Returns which optional features are enabled based on environment credentials.

**Response:**
```json
{
  "radioref_enabled": false
}
```

---

## RF Infrastructure

### `GET /api/rf/sites`

Query RF infrastructure sites within a geographic area.

**Query Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `lat` | float | *(required)* | Center latitude |
| `lon` | float | *(required)* | Center longitude |
| `radius_nm` | float | `150` | Search radius in nautical miles (1–2500) |
| `services` | string[] | `[]` | Filter by service: `ham`, `noaa`, `public_safety`, etc. |
| `modes` | string[] | `[]` | Filter by mode: `FM`, `DMR`, `P25`, `D-STAR`, `Fusion`, etc. |
| `emcomm_only` | bool | `false` | Return only EMCOMM-designated stations |
| `source` | string | *(all)* | Filter by source: `ard`, `noaa_nwr`, `radioref` |

Results are ordered by distance from the query point. Max 5,000 results. Responses cached in Redis for 1 hour.

**Response:**
```json
{
  "count": 247,
  "results": [
    {
      "id": "uuid",
      "source": "ard",
      "callsign": "W7ABC",
      "output_freq": 146.520,
      "input_freq": 146.520,
      "tone_ctcss": 100.0,
      "modes": ["FM"],
      "service": "ham",
      "emcomm_flags": ["ARES"],
      "lat": 45.51,
      "lon": -122.67,
      "city": "Portland",
      "state": "OR"
    }
  ]
}
```

---

### `GET /api/repeaters`

Alias for `/api/rf/sites` filtered to `service=ham`. Accepts radius in **miles** (converted internally to nm).

**Query Parameters:** `lat`, `lon`, `radius` (miles, default 75)

---

## Orbital

### `GET /api/orbital/passes`

Predict upcoming satellite passes visible from an observer location.

**Query Parameters:**
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `lat` | float | *(required)* | Observer latitude |
| `lon` | float | *(required)* | Observer longitude |
| `hours` | int | `6` | Prediction window (1–48 hours) |
| `min_elevation` | float | `10.0` | Minimum elevation angle in degrees (0–90) |
| `norad_ids` | string | *(all)* | Comma-separated NORAD IDs to filter |
| `category` | string | *(all)* | Filter by category: `gps`, `weather`, `intel`, etc. |
| `constellation` | string | *(all)* | Filter by constellation: `Starlink`, `GPS`, `Iridium`, etc. |
| `limit` | int | *(none)* | Maximum passes to return (1–500) |

> **Note:** Category `comms` requires specifying `norad_ids` or `constellation` — the fleet is too large for an unconstrained scan.

Results are cached in Redis for 5 minutes.

**Response:** Array of pass objects sorted by AOS:
```json
[
  {
    "norad_id": "25544",
    "name": "ISS (ZARYA)",
    "category": "leo",
    "aos": "2026-03-12T19:15:00Z",
    "tca": "2026-03-12T19:20:30Z",
    "los": "2026-03-12T19:26:00Z",
    "max_elevation": 72.4,
    "aos_azimuth": 315.2,
    "los_azimuth": 135.8,
    "duration_seconds": 660,
    "points": [
      { "t": "2026-03-12T19:15:00Z", "az": 315.2, "el": 10.0, "slant_range_km": 1247.3 }
    ]
  }
]
```

---

### `GET /api/orbital/groundtrack/{norad_id}`

Compute the sub-satellite ground track for one orbit.

**Path Parameters:** `norad_id` — NORAD catalog number (string)

**Query Parameters:**
| Parameter | Default | Range | Description |
| :--- | :--- | :--- | :--- |
| `minutes` | `90` | 1–1440 | Propagation window in minutes |
| `step_seconds` | `30` | 5–300 | Time step between points |

**Response:**
```json
[
  { "t": "2026-03-12T18:00:00Z", "lat": 51.6, "lon": -120.3, "alt_km": 421.2 }
]
```

---

### `GET /api/orbital/stats`

Returns satellite counts grouped by category.

**Response:**
```json
{ "gps": 120, "weather": 85, "comms": 7500, "intel": 210, "other": 480, "total": 8395 }
```

---

### `GET /api/orbital/constellation-stats`

Returns satellite counts grouped by category and constellation.

**Response:**
```json
{
  "comms": { "Starlink": 6800, "OneWeb": 580, "Iridium": 75 },
  "intel": { "RADARSAT": 3, "Spire": 80, "Planet": 120 }
}
```

---

## Infrastructure

### `GET /api/infra/cables`

Returns submarine cable route GeoJSON (sourced from TeleGeography, cached in Redis).

**Response:** GeoJSON `FeatureCollection` with cable LineString geometries.

---

### `GET /api/infra/stations`

Returns submarine cable landing station GeoJSON.

**Response:** GeoJSON `FeatureCollection` with landing station Point geometries.

---

### `GET /api/infra/outages`

Returns active internet outage data (sourced from IODA, cached in Redis, refreshed every 30 minutes).

**Response:** GeoJSON `FeatureCollection` with outage Point features:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "outage-RU",
        "region": "Russia",
        "country_code": "RU",
        "severity": 78.5,
        "datasource": "IODA_OVERALL"
      },
      "geometry": { "type": "Point", "coordinates": [37.6, 55.7] }
    }
  ]
}
```

---

## Debug

### `GET /api/debug/h3_cells`

Returns the current state of all H3 polling cells used by the ADS-B poller.

**Response:** Array of cell state objects:
```json
[
  {
    "cell": "8a2a1072b59ffff",
    "priority": 145,
    "last_polled": "2026-03-12T18:01:00Z",
    "aircraft_count": 12
  }
]
```

---

## Error Codes

| Code | Meaning |
| :--- | :--- |
| `400` | Invalid request parameters (bad timestamp, out-of-range value, etc.) |
| `404` | Entity not found (e.g., NORAD ID not in satellite table) |
| `422` | Malformed TLE or data format error |
| `503` | Database or Redis not ready (service starting up) |
| `500` | Internal server error (check logs) |
