# Configuration Reference

> All runtime configuration is managed through a single `.env` file at the project root.
> Copy `.env.example` to `.env` and fill in your values before running `docker compose up -d`.

---

## Quick Start

```bash
cp .env.example .env
# Edit .env with your values, then:
docker compose up -d --build
```

---

## Area of Responsibility (AOR)

These three variables define your **monitoring area** and are consumed by the ADS-B, AIS, and RF Pulse pollers.

| Variable             | Default     | Description                                          |
| :------------------- | :---------- | :--------------------------------------------------- |
| `CENTER_LAT`         | `45.5152`   | AOR center latitude (decimal degrees, -90 to +90)    |
| `CENTER_LON`         | `-122.6784` | AOR center longitude (decimal degrees, -180 to +180) |
| `COVERAGE_RADIUS_NM` | `150`       | AOR radius in nautical miles (10–300)                |

> **Tip:** The AOR can also be updated at runtime without restarting containers via the Settings HUD or `POST /api/config/location`.

**Default location:** Portland, OR, USA (`45.5152, -122.6784`)

---

## Map Rendering

| Variable             | Default   | Description                                                                                                                                                                                        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_MAPBOX_TOKEN`  | _(empty)_ | Mapbox GL JS access token. **Required** for 3D terrain and satellite imagery. Get one at [mapbox.com](https://mapbox.com). If empty, falls back to MapLibre + CARTO Dark Matter (no token needed). |
| `VITE_ENABLE_MAPBOX` | `true`    | Set to `false` to force MapLibre even when a Mapbox token is present.                                                                                                                              |

---

## Maritime (AIS)

| Variable            | Default   | Required | Description                                                                                                                         |
| :------------------ | :-------- | :------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `AISSTREAM_API_KEY` | _(empty)_ | **Yes**  | AISStream.io WebSocket API key. Get a free key at [aisstream.io](https://aisstream.io). Without this, no maritime data is ingested. |

---

## AI / LLM Cognition

Sovereign Watch uses **LiteLLM** as a unified AI gateway. It supports a triple-model architecture: local (**secure-core**), Gemini (**public-flash**), and Claude (**deep-reasoner**).

> **Important:** For detailed information on the three-layer configuration system, see the [AI & LLM Configuration Guide](./AI_Configuration.md).

| Variable | Default | Required | Description |
| :--- | :--- | :--- | :--- |
| `LITELLM_MODEL` | `secure-core` | No | Default model ID for the UI Analyst (`secure-core`, `public-flash`, or `deep-reasoner`). |
| `ANTHROPIC_API_KEY` | _(empty)_ | For Claude | Anthropic API key for cloud models. |
| `ANTHROPIC_MODEL` | `anthropic/claude-3-5-sonnet...` | No | LiteLLM model string for Claude. |
| `GEMINI_API_KEY` | _(empty)_ | For Gemini | Google AI Studio API key for Gemini models. |
| `GEMINI_MODEL` | `gemini/gemini-1.5-flash` | No | LiteLLM model string for Gemini. |
| `OPEN_API_BASE` | `http://localhost:11434` | No | Endpoint for local model (default: Ollama). |
| `OPEN_API_MODEL` | `openai/llama3` | No | Local model identifier used by LiteLLM. |

> The **local model** (`secure-core`) follows a "fail-closed" routing policy—it will never fall back to cloud providers to ensure data sovereignty. Use **Gemini** or **Claude** for higher reasoning capabilities when internet access is available.


---

## RF Infrastructure

### RepeaterBook

| Variable                     | Default   | Required         | Description                                                   |
| :--------------------------- | :-------- | :--------------- | :------------------------------------------------------------ |
| `REPEATERBOOK_API_TOKEN`     | _(empty)_ | For RepeaterBook | RepeaterBook API token. Ingestion is **disabled** if not set. |
| `RF_RB_RADIUS_MI`            | `200`     | No               | RepeaterBook query radius in **miles**.                       |
| `RF_REPEATERBOOK_INTERVAL_H` | `6`       | No               | Fetch interval in hours.                                      |

### RadioReference

| Variable            | Default   | Required     | Description                                                                                          |
| :------------------ | :-------- | :----------- | :--------------------------------------------------------------------------------------------------- |
| `RADIOREF_APP_KEY`  | _(empty)_ | For RadioRef | RadioReference application key. Ingestion is **disabled** if not set (along with username/password). |
| `RADIOREF_USERNAME` | _(empty)_ | For RadioRef | RadioReference account username.                                                                     |
| `RADIOREF_PASSWORD` | _(empty)_ | For RadioRef | RadioReference account password.                                                                     |

### RF Pulse Intervals

| Variable                     | Default | Description                                        |
| :--------------------------- | :------ | :------------------------------------------------- |
| `RF_REPEATERBOOK_INTERVAL_H` | `6`     | RepeaterBook fetch interval (hours)                |
| `RF_ARD_INTERVAL_H`          | `24`    | Amateur Radio Directory fetch interval (hours)     |
| `RF_NOAA_INTERVAL_H`         | `168`   | NOAA Weather Radio fetch interval (hours) — weekly |

---

## JS8Call / HF Radio Terminal

| Variable    | Default               | Description                                                                                      |
| :---------- | :-------------------- | :----------------------------------------------------------------------------------------------- |
| `KIWI_HOST` | `kiwisdr.example.com` | Primary KiwiSDR node for JS8Call decoding. Find nodes at [kiwisdr.com](http://kiwisdr.com).      |
| `KIWI_PORT` | `8073`                | KiwiSDR node port (default 8073).                                                                |
| `KIWI_FREQ` | `14074`               | Receive frequency in kHz. `14074` = 20m JS8Call calling frequency.                               |
| `KIWI_MODE` | `usb`                 | Receive mode. Use `usb` for JS8Call.                                                             |
| `MY_GRID`   | `CN85`                | Your grid square locator. Used for distance/bearing and JS8 station plotting.                    |

> **Note on WebSDR:** The WebSDR Discovery feature is global and does not require pre-configuration in `.env`. It utilizes an integrated crawler to discover available nodes in real-time.

---

## Database

| Variable            | Default           | Description                                                                     |
| :------------------ | :---------------- | :------------------------------------------------------------------------------ |
| `POSTGRES_PASSWORD` | `password`        | TimescaleDB postgres user password. **Change this for production deployments.** |
| `POSTGRES_DB`       | `sovereign_watch` | Database name (hardcoded in service configs; change with care).                 |

---

## Backend API

| Variable          | Default                             | Description                                                                    |
| :---------------- | :---------------------------------- | :----------------------------------------------------------------------------- |
| `ALLOWED_ORIGINS` | `http://localhost,http://127.0.0.1` | CORS allowed origins (comma-separated). Add your domain if accessing remotely. |

---

## Internal Service Variables

These are set automatically by `docker-compose.yml` and **do not need to be changed** in `.env`:

| Variable        | Value                            | Used By                           |
| :-------------- | :------------------------------- | :-------------------------------- |
| `KAFKA_BROKERS` | `sovereign-redpanda:9092`        | All pollers, Backend API          |
| `REDIS_HOST`    | `sovereign-redis`                | AIS, ADS-B, RF Pulse, Backend API |
| `REDIS_PORT`    | `6379`                           | AIS, ADS-B, RF Pulse, Backend API |
| `REDIS_URL`     | `redis://sovereign-redis:6379/0` | Infra Poller                      |
| `DB_DSN`        | `postgresql://postgres:...`      | Backend API                       |

---

## Feature Flags

The following features are automatically enabled or disabled based on credential presence:

| Feature                  | Enabled When                                                               |
| :----------------------- | :------------------------------------------------------------------------- |
| RepeaterBook ingestion   | `REPEATERBOOK_API_TOKEN` is set                                            |
| RadioReference ingestion | `RADIOREF_APP_KEY` + `RADIOREF_USERNAME` + `RADIOREF_PASSWORD` are all set |
| Mapbox 3D terrain        | `VITE_MAPBOX_TOKEN` is set and `VITE_ENABLE_MAPBOX=true`                   |
| Claude AI analysis       | `ANTHROPIC_API_KEY` is set                                                 |
| Gemini AI analysis       | `GEMINI_API_KEY` is set                                                    |

Use `GET /api/config/features` to check which features are currently enabled at runtime.

---

## Example `.env` File

```bash
# ── Area of Responsibility ─────────────────────────────────────
CENTER_LAT=38.8977
CENTER_LON=-77.0365
COVERAGE_RADIUS_NM=100

# ── Map ────────────────────────────────────────────────────────
VITE_MAPBOX_TOKEN=pk.eyJ1IjoiZXhhbXBsZSIsImEiOiJjbH...
VITE_ENABLE_MAPBOX=true

# ── Maritime ───────────────────────────────────────────────────
AISSTREAM_API_KEY=your-aisstream-key-here

# ── AI Cognition ───────────────────────────────────────────────
LITELLM_MODEL=secure-core
ANTHROPIC_API_KEY=sk-ant-api03-...
GEMINI_API_KEY=AIzaSy...
# See Documentation/AI_Configuration.md for more detailed AI options

# ── RF Infrastructure ──────────────────────────────────────────
REPEATERBOOK_API_TOKEN=your-rb-token
RF_RB_RADIUS_MI=150

# RadioReference (optional)
# RADIOREF_APP_KEY=your-rr-app-key
# RADIOREF_USERNAME=your-rr-username
# RADIOREF_PASSWORD=your-rr-password

# ── JS8Call / HF Radio ─────────────────────────────────────────
KIWI_HOST=my-kiwisdr-node.example.com
KIWI_PORT=8073
KIWI_FREQ=14074
KIWI_MODE=usb
MY_GRID=FM18

# ── Database ───────────────────────────────────────────────────
POSTGRES_PASSWORD=change-me-in-production
```


---

## Forcing Data Refreshes

High-latency infrastructure (FCC Towers, Submarine Cables, RadioReference) uses Redis caching to prevent redundant daily downloads. By default, these sync on a **7-day interval**.

### Use -1 to Bypass Start-Hour Gating
On a first-time setup, some services wait until a specific UTC hour (e.g., 3:00 AM) to avoid contention. You can force these to run **immediately on boot** by setting their start hour to `-1` in your `.env`:

| Feature | Variable | Force-Sync Value |
| :--- | :--- | :--- |
| **FCC Towers** | `POLL_FCC_START_HOUR` | `-1` |
| **Satellite TLEs** | `SPACE_TLE_FETCH_HOUR` | `-1` |
| **RadioReference** | `RF_RR_FETCH_HOUR` | `-1` |

### Space Pulse Intervals (Optional)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SATNOGS_DB_INTERVAL_H` | `24` | SatNOGS Transmitter DB fetch (hours) |
| `SATNOGS_NETWORK_INTERVAL_H` | `1` | SatNOGS Network Observations fetch (hours) |
| `AURORA_INTERVAL_S` | `300` | NOAA Aurora Forecast fetch (seconds, 5m) |
| `KP_INTERVAL_S` | `900` | NOAA Kp-Index fetch (seconds, 15m) |

### Manual Force-Sync via Redis
If a service has already run and you want to force it to run again before the 7-day cooldown expires, you must clear its timestamp from Redis using the following commands:

```bash
# Force FCC Towers refetch
docker exec -it sovereign-redis redis-cli DEL infra:last_fcc_fetch

# Force RadioReference refetch
docker exec -it sovereign-redis redis-cli DEL rf_pulse:last_radioref_fetch

# Force Submarine Cables refetch
docker exec -it sovereign-redis redis-cli DEL infra:last_cables_fetch

# Force Satellite TLE refetch
docker exec -it sovereign-redis redis-cli DEL space:last_tle_fetch
```

After clearing the key, restart the corresponding container to trigger the sync.

---

## Related

- [Deployment & Upgrade Guide](./Deployment.md)
- [ADS-B Poller Guide](./pollers/ADSB.md)
- [AIS Maritime Poller Guide](./pollers/AIS.md)
- [RF Pulse Guide](./pollers/RF.md)
