# RF Pulse — RF Infrastructure Poller Guide

> **Container:** `sovereign-rf-pulse`
> **Source Code:** `backend/ingestion/rf_pulse/`
> **Kafka Output Topic:** `rf_raw`
> **Database Table:** `rf_sites`

---

## Overview

RF Pulse ingests radio frequency infrastructure data from multiple public sources, building a comprehensive geospatial database of:

- **Amateur radio repeaters** — VHF/UHF/HF relay stations for communication in any theater
- **NOAA Weather Radio** — Emergency weather broadcast transmitter network
- **Trunked/conventional radio systems** — Public safety, government, and commercial radio systems (via RadioReference)

All RF infrastructure records are stored in the `rf_sites` TimescaleDB table and served via the `GET /api/rf/sites` endpoint with powerful geospatial filtering.

---

## Data Sources

### 1. Amateur Radio Directory (ARD)

| Feed | URL | Auth |
| :--- | :--- | :--- |
| **Amateur Radio Directory** | `amateur-radio-directory.com` | No (web scraping) |

ARD provides supplemental amateur radio repeater data via public web pages. The poller uses `BeautifulSoup4` and `lxml` for HTML parsing.

**Polling interval:** Every **24 hours** (configurable via `RF_ARD_INTERVAL_H`)

---

### 2. NOAA Weather Radio (NWR)

| Feed | URL | Auth |
| :--- | :--- | :--- |
| **NOAA NWR Station List** | `weather.gov/nwr/` | No (public CSV) |

NOAA Weather Radio All Hazards is a nationwide network of radio stations broadcasting continuous weather information and emergency alerts. The poller fetches and parses the NOAA master station CSV to extract all transmitter coordinates and frequencies.

**Polling interval:** Every **168 hours** (weekly) — configurable via `RF_NOAA_INTERVAL_H`

---

### 3. RadioReference

| Feed | URL | Auth |
| :--- | :--- | :--- |
| **RadioReference SOAP API** | `radioreference.com` | `RADIOREF_APP_KEY` + `RADIOREF_USERNAME` + `RADIOREF_PASSWORD` |

RadioReference provides comprehensive data on trunked radio systems, conventional public safety frequencies, federal frequencies, and more. The integration uses the **SOAP protocol** via the `zeep` Python library.

**Polling interval:** Every **24 hours**

> This source is **disabled** unless all three RadioReference credentials are set in `.env`.

---

## Polling Rate Summary

| Source | Interval | Env Override | Required Credentials |
| :--- | :--- | :--- | :--- |
| ARD | Every **24 hours** | `RF_ARD_INTERVAL_H` | None |
| NOAA NWR | Every **168 hours** (weekly) | `RF_NOAA_INTERVAL_H` | None |
| RadioReference | Every **24 hours** | *(hardcoded)* | `RADIOREF_APP_KEY` + `RADIOREF_USERNAME` + `RADIOREF_PASSWORD` |

---

## Configuration

| Variable | Default | Description |
| :--- | :--- | :--- |
| `RADIOREF_APP_KEY` | *(empty)* | RadioReference application key |
| `RADIOREF_USERNAME` | *(empty)* | RadioReference account username |
| `RADIOREF_PASSWORD` | *(empty)* | RadioReference account password |
| `RF_ARD_INTERVAL_H` | `24` | ARD fetch interval (hours) |
| `RF_NOAA_INTERVAL_H` | `168` | NOAA NWR fetch interval (hours) |
| `KAFKA_BROKERS` | `sovereign-redpanda:9092` | Redpanda bootstrap servers |
| `REDIS_HOST` | `sovereign-redis` | Redis hostname |

---

## Data Flow

```
ARD (web scrape)  ─┐
NOAA NWR CSV     ─┤→  RFPulseService.run()  →  rf_raw Kafka topic
RadioReference   ─┘       (concurrent source loops)

Backend API historian reads rf_raw topic
    ↓
TimescaleDB: rf_sites table  →  GET /api/rf/sites (with spatial filter)
```

All source loops run **concurrently** via `asyncio.gather()`. Each source loop independently tracks its own last-fetch timestamp and sleeps until its interval elapses.

---

## rf_sites Database Schema

Each RF site record includes:

| Field | Description |
| :--- | :--- |
| `id` | UUID primary key |
| `source` | Source name: `ard`, `noaa_nwr`, `radioref` |
| `site_id` | Source-specific identifier |
| `service` | Service type: `ham`, `noaa`, `public_safety`, etc. |
| `callsign` | Station callsign |
| `name` | Station name |
| `lat` / `lon` | Geographic coordinates |
| `output_freq` | Output (receive) frequency in MHz |
| `input_freq` | Input (transmit) frequency in MHz |
| `tone_ctcss` | CTCSS access tone (Hz) |
| `tone_dcs` | DCS digital code |
| `modes` | Array: `FM`, `DMR`, `P25`, `D-STAR`, `Fusion`, etc. |
| `use_access` | Access type: `open`, `closed`, `private` |
| `status` | Operational status |
| `city` / `state` / `country` | Location |
| `emcomm_flags` | Array of EMCOMM designations (ARES, RACES, SKYWARN, etc.) |
| `meta` | JSONB blob with source-specific extras |
| `fetched_at` | Timestamp of last data fetch |

---

## API Filtering

The `GET /api/rf/sites` endpoint supports powerful server-side filtering:

```
GET /api/rf/sites?lat=45.51&lon=-122.67&radius_nm=100&modes=DMR&emcomm_only=true
```

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `lat` | float | Center latitude (required) |
| `lon` | float | Center longitude (required) |
| `radius_nm` | float | Search radius in nautical miles (1–2500, default 150) |
| `services` | string[] | Filter by service type (e.g., `ham`, `noaa`) |
| `modes` | string[] | Filter by digital mode (e.g., `DMR`, `P25`) |
| `emcomm_only` | bool | Return only EMCOMM-designated stations |
| `source` | string | Filter by data source: `ard`, `noaa_nwr`, `radioref` |

Results are spatially sorted by distance from the query point and limited to 5,000 records. Results are cached in Redis for 1 hour per unique query.

---

## Tactical Display

On the Tactical Map, RF infrastructure appears as markers colored **Emerald Green**:

- **Repeater markers** — Sized by signal coverage area
- **NOAA transmitter markers** — Distinct weather radio icon
- **EMCOMM stations** — Highlighted with additional visual indicator

The RF layer is toggled in the **Infrastructure** tab of the Settings HUD.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
| :--- | :--- | :--- |
| No RF sites visible | ARD/NOAA not yet fetched | RF data loads at startup; wait for first cycle |
| Only NOAA/ARD data | RadioReference disabled | Check `RADIOREF_APP_KEY`/`USERNAME`/`PASSWORD` are set |
| Stale RF data | First fetch not yet complete | RF data loads once at startup; wait for first cycle |
| `zeep` / SOAP errors | RadioReference API changes | Check logs; SOAP endpoint may require credential renewal |

---

## Related

- [Configuration Reference](../Configuration.md)
- [API Reference — RF](../API_Reference.md#rf-infrastructure)
