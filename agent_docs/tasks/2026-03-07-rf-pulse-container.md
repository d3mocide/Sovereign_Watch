# 2026-03-07 RF Pulse Container Implementation

## Objective
Implement all three phases of the RF Pulse Container integration as specified in the `2026-03-07-rf-pulse-container.md` plan, ensuring RF site data (RepeaterBook, NOAA Weather Radio, and RadioReference) is properly ingested, published to Kafka, stored in the historian, and surfaced on the frontend UI.

## Implementation Details

### Phase 1: RF-Pulse Architecture & Basic Sources
* **Database Updates**: Added `rf_sites`, `rf_systems`, and `rf_talkgroups` tables with PostGIS extensions and GIN indices.
* **RF-Pulse Poller**: Created `backend/ingestion/rf_pulse` with sources `repeaterbook.py` and `ard.py` using `httpx` to publish to the `rf_raw` Kafka topic.
* **Historian & API**: Updated the historian service (`backend/api/services/historian.py`) to consume `rf_raw` messages and upsert them into the database. Replaced `repeaters.py` with `rf.py` to support spatial queries. Updated `docker-compose.yml` to include the new RF pulse poller.

### Phase 2: NOAA Weather Radio
* **Source Implementation**: Implemented `backend/ingestion/rf_pulse/sources/noaa_nwr.py` to fetch station data from `https://www.weather.gov/source/nwr/JS/CCL.js`.
* **Parsing**: Used regex to parse the JavaScript array and extract fields: `SITENAME`, `CALLSIGN`, `FREQ`, `LAT`, `LON`, and `STATUS`. Deduplicated entries by callsign and published to Kafka.

### Phase 3: RadioReference API
* **Source Implementation**: Implemented `backend/ingestion/rf_pulse/sources/radioref.py` using an async SOAP client (`zeep` with `httpx.AsyncClient`) targeting the RadioReference API (`https://api.radioreference.com/soap2/?wsdl`).
* **Execution Gating**: Data fetching is gated behind the `RADIOREF_APP_KEY` environment variable. Trunked systems are properly mapped into the Kafka ingestion format.

### Frontend Integration
* **Hooks & UI State**: Updated `App.tsx` and `SystemStatus.tsx` to properly filter and pass the selected RF services (`Ham`, `NOAA`, `Public Safety`) to the `useRFSites` hook.
* **Typing**: Removed TypeScript casts in `SystemStatus.tsx` and modified the `MapFilters` type definition in `types.ts` to allow indexing by string, resulting in cleaner and more robust filter state management.
* **Visuals**: Confirmed functionality with Playwright tests checking the rendering of the RF Infrastructure map layer.

## Verification
* Checked backend with `ruff check .` ensuring no linting or import issues.
* Verified frontend with a Playwright script successfully opening the layers panel, selecting RF infrastructure filters, and capturing a clean screenshot.
* Validated pre-commit workflows.
