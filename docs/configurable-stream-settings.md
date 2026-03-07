# Configurable Stream Settings — Research & Implementation Plan

**Date**: 2026-03-07
**Branch**: `claude/configurable-stream-settings-6PEd2`

---

## Background

Sovereign Watch currently sources ADS-B and AIS telemetry from hardcoded providers
configured exclusively via environment variables at container start. API keys, source
priority, and provider selection cannot be changed at runtime. This document captures
the research findings and a concrete implementation plan for making these settings
configurable from the frontend.

---

## Current State

### AIS (`backend/ingestion/maritime_poller/`)
- Provider: **AISStream.io** (WebSocket)
- API key: `AISSTREAM_API_KEY` environment variable — read once at startup
- Bounding box: derived from `CENTER_LAT`, `CENTER_LON`, `COVERAGE_RADIUS_NM`
- Already reacts to mission area changes via Redis `navigation-updates` pub/sub

### ADS-B (`backend/ingestion/aviation_poller/`)
- Provider: **Multi-source round-robin** — `adsb.fi`, `adsb.lol`, `airplanes.live`
- No API keys required for current sources
- Backoff logic handles 429s (30 s–5 min cooldown)
- Already reacts to mission area changes via Redis `navigation-updates` pub/sub

### Existing Settings Pattern (Mission Area)
The stack has a working pattern to follow:

```
Frontend form
  → POST /api/config/location
    → Redis key "mission:active" (persist)
    → Redis pub/sub "navigation-updates" (notify)
      → All pollers reconnect / recalculate AOI
```

Stream settings should follow this same pattern exactly.

---

## Other Backend Settings Worth Exposing

| Setting | Current Home | Proposed |
|---|---|---|
| AI model selection | `LITELLM_MODEL` env var | DB + `/api/settings/system` |
| Track history window | `TRACK_HISTORY_MAX_HOURS` hardcoded | DB + `/api/settings/system` |
| Data retention policy | TimescaleDB retention (hardcoded 24 h) | DB + `/api/settings/system` |
| Mapbox token | `VITE_MAPBOX_TOKEN` env var (baked at build) | DB + served via API |
| KiwiSDR host / port / freq | `KIWI_*` env vars | DB + `/api/settings/system` |
| Satellite constellation groups | Hardcoded list in `orbital_pulse` | DB + `/api/settings/system` |

---

## Implementation Plan

### Phase 1 — Backend: Persistent Settings Store

**1a. Database schema**

Add to `backend/db/init.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings_audit (
    id         BIGSERIAL PRIMARY KEY,
    key        TEXT NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT now(),
    summary    TEXT   -- human-readable description of what changed (masked)
);
```

Use PostgreSQL (not Redis) — Redis is ephemeral and unsuitable for persisting secrets.
Redis is still used for the pub/sub notification channel.

**1b. Encryption helper** (`backend/api/core/crypto.py`)

Sensitive values (API keys) are encrypted at rest using AES-256-GCM via the
`cryptography` library. The encryption key comes from a `SETTINGS_ENCRYPTION_KEY`
environment variable that never enters the database.

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, base64

def encrypt(plaintext: str) -> str: ...
def decrypt(ciphertext: str) -> str: ...
def mask(plaintext: str) -> str:
    """Return first 6 + last 3 chars, middle replaced with ***"""
    ...
```

**1c. Settings service** (`backend/api/services/settings.py`)

```python
async def get_stream_settings(db) -> StreamSettings: ...
async def put_stream_settings(db, redis, payload: StreamSettings) -> None:
    # 1. Encrypt any API key fields
    # 2. Upsert into user_settings
    # 3. Write audit row
    # 4. Publish to Redis "settings-updates" channel
    ...
```

---

### Phase 2 — Backend: New API Router

**New file**: `backend/api/routers/settings.py`

```
GET  /api/settings/streams   → StreamSettingsResponse (keys masked)
POST /api/settings/streams   ← StreamSettingsUpdate

GET  /api/settings/system    → SystemSettingsResponse
POST /api/settings/system    ← SystemSettingsUpdate
```

**Stream settings payload shape**:

```json
{
  "ais": {
    "provider": "aisstream",
    "api_key": null,
    "ws_url": "wss://stream.aisstream.io/v0/stream",
    "enabled": true
  },
  "adsb": {
    "sources": {
      "adsb_fi":        { "enabled": true,  "priority": 1 },
      "adsb_lol":       { "enabled": true,  "priority": 2 },
      "airplanes_live": { "enabled": true,  "priority": 3 },
      "opensky":        { "enabled": false, "api_key": null, "priority": 4 },
      "flightaware":    { "enabled": false, "api_key": null, "priority": 5 }
    }
  }
}
```

**Key rules**:
- `api_key: null` on POST → leave existing key unchanged
- `api_key: ""` on POST → clear the key
- GET always returns `api_key` as a masked string (e.g., `"sk-abc***xyz"`) or `null`

**Wire the router** in `backend/api/main.py`:

```python
from routers import settings as settings_router
app.include_router(settings_router.router, prefix="/api")
```

---

### Phase 3 — Poller Changes

Both pollers need to:

1. **On startup**: fetch current settings from backend API (`GET /api/settings/streams`)
   rather than relying solely on env vars. Environment variables become **fallbacks only**.

2. **At runtime**: subscribe to Redis `settings-updates` pub/sub channel and hot-reload
   without container restart. The AIS poller already has reconnect logic for mission area
   changes — apply the same pattern.

**AIS poller changes** (`maritime_poller/`):

```python
async def on_settings_update(msg):
    data = json.loads(msg["data"])
    if "ais" in data:
        new_key = decrypt(data["ais"]["api_key_enc"])
        new_url = data["ais"]["ws_url"]
        await reconnect_aisstream(new_key, new_url)
```

**ADS-B poller changes** (`aviation_poller/`):

```python
async def on_settings_update(msg):
    data = json.loads(msg["data"])
    if "adsb" in data:
        update_source_list(data["adsb"]["sources"])
        # round-robin rebuilds automatically on next tick
```

---

### Phase 4 — Frontend: Settings Panel

**New component**: `frontend/src/components/widgets/SettingsPanel.tsx`

Accessible via a gear icon in `TopBar.tsx`. Renders as a side drawer or modal with two tabs.

**Streams tab** — for each data source:
- Toggle (enabled / disabled)
- Provider dropdown (AIS: `aisstream` / `marinetraffic` / `vesseltracker`)
- API key field: `type="password"`, displays masked placeholder, has "Update key" button
  - Never prefills the real key — backend returns masked value as placeholder text only
  - Submit only sends the new key if the field was touched
- Custom WebSocket / endpoint URL (collapsible "Advanced" section)
- Connection status dot (green = healthy, yellow = degraded, red = no data)

**System tab**:
- AI model selector (Claude Sonnet 4.6 / Haiku 4.5 / Gemini 2.0 Flash / etc.)
- Track history window (slider: 1 h → 72 h)
- Data retention policy (radio: 1 day / 3 days / 7 days)
- Satellite constellations (multi-select checkboxes: GPS, GLONASS, Galileo, BeiDou,
  Weather, Comms, Intel, LEO, SAR)

**New API client** (`frontend/src/api/streamSettings.ts`):

```typescript
// GET /api/settings/streams
export async function getStreamSettings(): Promise<StreamSettings> { ... }

// POST /api/settings/streams
export async function putStreamSettings(update: StreamSettingsUpdate): Promise<void> { ... }
```

---

### Phase 5 — Security & Audit

- **Never return plaintext API keys** to the frontend.
- The `SETTINGS_ENCRYPTION_KEY` env var lives only on the server; never stored in DB.
- All key changes write a row to `settings_audit` with a masked summary.
- The `/api/settings/*` endpoints are same-origin only (enforced by Nginx). When auth
  is added later, these are the first endpoints to gate.

---

## File Changelist

```
backend/db/init.sql                          # ADD: user_settings + settings_audit tables
backend/api/core/crypto.py                   # NEW: AES-256-GCM encrypt/decrypt/mask
backend/api/core/config.py                   # ADD: SETTINGS_ENCRYPTION_KEY setting
backend/api/services/settings.py             # NEW: get/put settings + pub/sub publish
backend/api/routers/settings.py              # NEW: GET/POST /api/settings/{streams,system}
backend/api/main.py                          # ADD: include_router(settings_router)
backend/ingestion/maritime_poller/           # MOD: startup fetch + settings-updates sub
backend/ingestion/aviation_poller/           # MOD: startup fetch + settings-updates sub
frontend/src/api/streamSettings.ts           # NEW: API client
frontend/src/components/widgets/SettingsPanel.tsx  # NEW: UI drawer
frontend/src/components/layouts/TopBar.tsx   # MOD: add gear icon + SettingsPanel mount
```

---

## Complexity & Risk Assessment

| Component | Effort | Risk | Notes |
|---|---|---|---|
| DB schema + encryption helper | Low | Low | Straightforward crypto wrapper |
| Backend settings router | Medium | Low | Follows existing mission area pattern |
| Poller hot-reload on settings change | Medium | Medium | Reconnect edge cases (partial failure, race) |
| Frontend Settings panel UI | Medium | Low | Standard form + masked key UX |
| Env-var → DB-first migration | Low | Low | Env vars remain as defaults/fallbacks |
