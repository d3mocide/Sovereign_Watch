# Deployment & Upgrade Guide

> This guide covers fresh installation, configuration, running the system, and upgrading between versions.

---

## Prerequisites

| Requirement | Notes |
| :--- | :--- |
| **Docker** | Version 24+ recommended |
| **Docker Compose** | v2 (included with Docker Desktop) |
| **NVIDIA Container Toolkit** | Only required if using the LLaMA3 local AI model on a GPU |
| **Internet connectivity** | Required for external data feeds (ADS-B, AIS, Celestrak, etc.) |

**Minimum hardware:**

- 4 CPU cores
- 8 GB RAM
- 40 GB disk (for TimescaleDB data — 72-hour AIS/ADS-B retention with compression)

---

## Fresh Installation

### 1. Clone the Repository

```bash
git clone https://github.com/d3mocide/Sovereign_Watch.git
cd Sovereign_Watch
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values. At minimum, configure:

```bash
# Your monitoring area
CENTER_LAT=45.5152
CENTER_LON=-122.6784
COVERAGE_RADIUS_NM=150

# Required for maritime data
AISSTREAM_API_KEY=your-key-here

# Required for 3D terrain maps (optional — falls back to free CARTO)
VITE_MAPBOX_TOKEN=your-token-here

# Required for AI analysis (at least one)
ANTHROPIC_API_KEY=sk-ant-...
# or GEMINI_API_KEY=AIzaSy...
```

See [Configuration Reference](./Configuration.md) for the complete variable reference.

### 3. Build and Start

```bash
docker compose up -d --build
```

This starts all services:

| Container | Role |
| :--- | :--- |
| `sovereign-nginx` | Reverse proxy, serves frontend on port 80 |
| `sovereign-frontend` | React/Vite application (HMR dev server) |
| `sovereign-backend` | FastAPI fusion API |
| `sovereign-timescaledb` | TimescaleDB (PostgreSQL + time-series extensions) |
| `sovereign-redpanda` | Kafka-compatible message bus |
| `sovereign-redis` | Redis cache and pub/sub |
| `sovereign-adsb-poller` | ADS-B aviation ingestion |
| `sovereign-ais-poller` | AIS maritime ingestion |
| `sovereign-space-pulse` | SGP4, SatNOGS, and Space Weather |
| `sovereign-infra-poller` | Internet outages + submarine cables |
| `sovereign-rf-pulse` | RF infrastructure ingestion |
| `sovereign-js8call` | JS8Call HF radio terminal |

### 4. Verify Startup

```bash
# Check all containers are running
docker compose ps

# View aggregate logs
docker compose logs -f

# View a specific service
docker compose logs -f sovereign-backend
docker compose logs -f sovereign-adsb-poller
docker compose logs -f sovereign-space-pulse
```

### 5. Access the Interface

| Interface | URL |
| :--- | :--- |
| **Tactical Map (UI)** | `http://localhost` |
| **API Swagger Docs** | `http://localhost/api/docs` |
| **API ReDoc** | `http://localhost/api/redoc` |

---

## Initial Data Load Times

After a fresh start, allow time for the pollers to populate data:

| Data Type | Expected Time |
| :--- | :--- |
| Aviation (ADS-B) | ~5–10 seconds |
| Maritime (AIS) | ~10–30 seconds (first vessel arrives) |
| Space (SGP4/SatNOGS) | ~30–60 seconds (initial fetch + propagation) |
| RF Infrastructure (ARD, NOAA NWR) | ~2–5 minutes |
| JS8Call Radio Traffic | ~5–10 seconds |
| RepeaterBook (if enabled) | ~3–10 minutes |
| Submarine cables | ~1–2 minutes |
| Internet outages | ~2–5 minutes |

---

## Stopping the System

```bash
# Stop all containers (data is preserved in named volumes)
docker compose down

# Stop and remove all data volumes (DESTRUCTIVE — deletes all TimescaleDB data)
docker compose down -v
```

---

## Upgrading an Existing Installation

### 1. Pull Latest Code

```bash
git pull
```

### 2. Rebuild and Restart

```bash
docker compose up -d --build
```

Docker Compose will rebuild only the containers whose images have changed and restart them.

### 3. Apply Database Migrations (when required)

Some releases include database schema changes. The release notes will specify if a migration is needed.

Check [RELEASE_NOTES.md](../RELEASE_NOTES.md) before upgrading.

#### Example: Applying a migration

```bash
docker compose exec -T timescaledb psql -U postgres -d sovereign_watch < ./backend/db/migrate_rf_plus.sql
```

**Available migrations** (applied in filename order where dependencies exist):

| File | Purpose |
| :--- | :--- |
| `backend/db/migrate_add_constellation.sql` | Adds `constellation` column to `satellites` |
| `backend/db/migrate_rf_plus.sql` | Creates RF infrastructure tables |
| `backend/db/migrate_orbital_tracks_cd.sql` | Creates `orbital_tracks` hypertable; strips TLE from per-row storage |
| `backend/db/migrate_tracks_72h_retention.sql` | Extends `tracks` retention to 72 h; tightens compression to 1 h |

> **Fresh installations do not need to run migration scripts** — the full schema is applied automatically on first start via `backend/db/init.sql`.

### 4. Verify After Upgrade

```bash
docker compose ps          # All containers running
docker compose logs -f     # Watch for startup errors
```

---

## Hot Reload (Development)

Sovereign Watch is configured for **Hot Module Replacement** in development:

| Service | Trigger | Action |
| :--- | :--- | :--- |
| **Frontend** | Save any `.tsx` / `.ts` / `.css` file | Vite automatically hot-reloads in the browser (no restart) |
| **Backend API** | Save any `.py` file | Uvicorn auto-reloads (no restart needed) |
| **Ingestion Pollers** | Save any `.py` file | **Requires manual restart:** `docker compose restart sovereign-adsb-poller` |

**Important:** Only rebuild containers when `Dockerfile` or dependency files (`pyproject.toml`, `uv.lock`, `package.json`, `pnpm-lock.yaml`) change:

```bash
# Rebuild a specific service
docker compose up -d --build sovereign-adsb-poller
```

---

## Container Management

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f sovereign-space-pulse
docker compose logs -f sovereign-rf-pulse

# Last 50 lines
docker compose logs --tail=50 sovereign-backend
```

### Restarting a Service

```bash
docker compose restart sovereign-adsb-poller
```

### Running One-Off Commands

```bash
# Python shell in backend
docker compose run --rm sovereign-backend python

# psql database shell
docker compose exec timescaledb psql -U postgres -d sovereign_watch

# Redis CLI
docker compose exec sovereign-redis redis-cli
```

### Checking Resource Usage

```bash
docker compose stats
```

---

## Nginx Reverse Proxy

Nginx (`sovereign-nginx`) routes all traffic through a single port (80):

| Path | Destination |
| :--- | :--- |
| `/` | Frontend React app |
| `/api/` | Backend FastAPI (`sovereign-backend:8000`) |
| `/js8/` | JS8Call WebSocket bridge (`sovereign-js8call`) |

The Nginx configuration is at `nginx/`. No changes are needed for standard deployments.

---

## Data Retention

Sovereign Watch uses multiple hypertables with independent retention policies to balance storage vs. tactical depth:

| Hypertable | Data | Retention | Compression |
| :--- | :--- | :--- | :--- |
| `tracks` | AIS vessels, ADS-B aircraft | **72 hours** | After 4 hours |
| `satnogs_observations` | Multi-source spectrum verification | **30 days** | After 1 day |
| `space_weather_kp` | NOAA Kp-Index / Storm levels | **7 days** | After 1 day |
| `jamming_events` | ADS-B interference / GPS jamming | **7 days** | After 1 day |

**Note on Satellites:** Orbital positions are no longer stored in a hypertable. They are **deterministic** (reproducible from TLE via SGP4) so positions are computed in-memory on demand by the API via `/api/tracks/history/{norad_id}`. This significantly reduces I/O while maintaining full historical fidelity.

See `agent_docs/TIMESCALE_RETENTION.md` for the full retention reference including monitoring queries and manual cleanup commands.

---

## Security Notes

- **Change `POSTGRES_PASSWORD`** from the default `password` before deploying outside a local machine.
- **`ALLOWED_ORIGINS`** defaults to `localhost` — add your domain if accessing remotely.
- **API keys** (Anthropic, Mapbox, AISStream, RadioReference) are injected at container build time via environment variables — never commit them to the repository.
- The API does not require authentication by default. Consider placing Nginx behind a VPN or adding HTTP Basic Auth via Nginx for any internet-facing deployment.

---

## Troubleshooting

### Container Fails to Start

```bash
# Check which container failed
docker compose ps

# View its logs
docker compose logs sovereign-backend
```

### Database Connection Errors

TimescaleDB takes 15–30 seconds to initialize on first run. Backend services retry automatically. If errors persist after 60 seconds:

```bash
docker compose restart sovereign-timescaledb
docker compose restart sovereign-backend
```

### No Data on the Map

1. Check poller logs: `docker compose logs sovereign-adsb-poller`
2. Verify your AOR (`CENTER_LAT` / `CENTER_LON`) is in a populated area
3. Check Redpanda is healthy: `docker compose logs sovereign-redpanda`
4. Verify your `AISSTREAM_API_KEY` for maritime data

### Frontend Not Loading

```bash
docker compose logs sovereign-frontend
docker compose logs sovereign-nginx
```

### Resetting Everything

```bash
# Full reset — destroys all data
docker compose down -v
docker compose up -d --build
```

---

## Related

- [Configuration Reference](./Configuration.md)
- [API Reference](./API_Reference.md)
- [RELEASE_NOTES.md](../RELEASE_NOTES.md)
