# GEODENT (GDELT Pulse)

The **GEODENT** (Geospatial Data Event Network) data pipe handles the ingestion and processing of OSINT (Open Source Intelligence) events from the **GDELT Project**. It provides a real-time stream of global events, such as protests, conflicts, and diplomatic movements, which are infused into the Intelligence Stream for tactical context.

---

## Overview

GDELT monitors the world's news media in over 100 languages, identifying the people, locations, organizations, themes, sources, emotions, counts, quotes, images and events driving our global society. GEODENT pulls the **Realtime GDELT 2.0 Event Stream** and maps it to the Sovereign Watch tactical environment.

| Component | Responsibility |
| :--- | :--- |
| **Ingestion Poller** | `backend/ingestion/gdelt_pulse` |
| **API Router** | `backend/api/routers/gdelt.py` |
| **Source URL** | [gdeltproject.org](https://www.gdeltproject.org) |
| **Update Rate** | Every 15 minutes (GDELT's native rolling window) |

---

## How It Works

1. **Polling**: Every 15 minutes, the `gdelt_pulse` service checks `lastupdate.txt` on the GDELT servers.
2. **Downloading**: If a new update is found, it downloads the latest Export ZIP file.
3. **Parsing**: The poller extracts the TSV data, filtering for events with valid geospatial coordinates.
4. **Ingestion**: Events are normalized and pushed to the Redpanda (Kafka) topic `gdelt_raw`.
5. **Persistence**: The Historian service consumes the topic and persists significant events to TimescaleDB.
6. **Streaming**: The UI connects via WebSocket/Polling to view real-time events in the **Intelligence Stream**.

---

## Configuration

The Following environment variables control the GEODENT pipe in `.env`:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `POLL_INTERVAL` | `900` | Fetch interval in seconds (default: 15 minutes). |

---

## UI Integration

GEODENT events are displayed in two primary locations:

### 1. Intelligence Stream (Right Sidebar)

Events appear as line items in the stream. Clicking an event will:

- **Search** for related local tracks (Aviation/Maritime) using the event's location.
- **Fly** the map to the event coordinates.

### 2. GDELT Breakdown Widget

The dashboard includes a breakdown of GDELT events, showing:

- **Goldstein Scale**: Numerical score (-10 to +10) representing the theoretical impact of the event on the stability of a country.
- **Average Tone**: The "mood" of the news coverage surrounding the event.
- **Category**: Conflict, Protest, Military Move, etc.

---

## Data Schema (TAK Extension)

GEODENT events are mapped to a simplified TAK-compatible CoT (Cursor on Target) structure with extended GDELT metadata:

```json
{
  "event_id": "...",
  "time": 1711123456000,
  "lat": 45.5152,
  "lon": -122.6784,
  "goldstein": 5.0,
  "tone": -2.4,
  "headline": "Actor Name or Event Category",
  "url": "https://source.url/article",
  "dataSource": "GDELT"
}
```

---

## Troubleshooting

- **Check Logs**: `docker compose logs sovereign-gdelt-pulse`
- **Kafka Topic**: Ensure the `gdelt_raw` topic is receiving data using `rpk topic consume gdelt_raw`.
- **API Status**: Verify the endpoint at `GET /api/gdelt/latest`.
