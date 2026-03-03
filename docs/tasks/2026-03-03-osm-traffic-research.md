# OpenStreetMap Traffic Data Integration Research

**Date:** 2026-03-03
**Topic:** Rendering Live Traffic Data on top of OpenStreetMap/Mapbox

## Executive Summary
OpenStreetMap (OSM) itself provides static geographic and road network data (e.g., speed limits, road topology, lane counts) but **does not natively provide live traffic or congestion data**. Crowdsourcing real-time telemetry from vehicles requires massive infrastructure, which OSM does not natively host.

To render a live traffic map layer, we must integrate a third-party traffic data provider that overlays its live congestion data (usually in the form of Vector Tiles or Raster Tiles) onto our existing OSM/Mapbox basemap.

This document outlines the available commercial and open options, their costs, and architectural approaches for both Frontend-only and Backend-supported integrations.

## 1. Data Providers & Costs

### Option A: Mapbox Traffic (Recommended)
Since our project relies on Mapbox and Deck.gl for rendering, Mapbox Traffic is the most seamless integration. Mapbox aggregates anonymized telemetry from millions of mobile devices.
- **Capabilities:** Real-time traffic flow, congestion levels (low, moderate, heavy, severe), and incident reporting (accidents, construction).
- **Format:** Vector Tiles (`mapbox.mapbox-traffic-v1`).
- **Cost:** Included in Mapbox Vector Tiles pricing. Mapbox offers a generous free tier (e.g., up to 200,000 vector tile requests/month free), after which it costs ~$0.25 per 1,000 requests.
- **Pros:** Native integration with Mapbox GL JS / Deck.gl, highly customizable styling, global coverage.

### Option B: TomTom Traffic Flow API
TomTom is a leading provider of live traffic data globally.
- **Capabilities:** Real-time traffic flow (speed vs. free-flow speed) and traffic incidents.
- **Format:** Vector Tiles (PBF) and Raster Tiles.
- **Cost:** Free tier includes 2,500 transactions per day. Paid tier starts around $0.50 per 1,000 API transactions.
- **Pros:** Extremely accurate data, independent of Mapbox.
- **Cons:** Requires a separate API key and billing account.

### Option C: HERE Traffic API
Similar to TomTom, HERE provides robust enterprise-grade traffic data.
- **Capabilities:** Flow data and incidents.
- **Format:** Vector and Raster tiles.
- **Cost:** Freemium model. "Base" plan offers 30,000 monthly transactions free.
- **Pros:** High-quality enterprise data.
- **Cons:** Complex documentation and integration compared to Mapbox.

### Option D: Open / Free Alternatives
There is **no global, fully open-source, free live traffic API**. Live traffic requires massive real-time telemetry ingestion, which costs money.
- **Waze Connected Citizens Program (CCP):** Free, but restricted to government/municipal partners. Not available for general public apps.
- **Local Government Feeds (e.g., 511 systems):** Some states/cities provide open APIs for traffic speeds or incidents, but the data formats vary wildly (XML, JSON, GTFS), and coverage is strictly regional. Not suitable for a global tactical map.

---

## 2. Architectural Approaches

### Approach 1: Frontend-Only Integration (Vector Tiles)
The easiest, cheapest, and most legally compliant way to integrate traffic.

**How it works:**
1. The frontend Mapbox/Deck.gl instance requests Traffic Vector Tiles directly from the provider (e.g., Mapbox Traffic API) using a client-side API Key.
2. The vector tiles are rendered directly on the client GPU as a `MVTLayer` in Deck.gl or a standard Mapbox style layer.

**Pros:**
- **Zero Backend Load:** The backend does not need to process or store anything.
- **Low Latency:** Direct from the edge CDN to the client browser.
- **ToS Compliant:** Providers strictly prohibit caching, saving, or redistributing their live traffic data. Direct client-side requests avoid these Terms of Service violations.

**Cons:**
- Client-side API keys can be exposed (though Mapbox allows domain-restricting keys).
- If rendering in Deck.gl alongside hundreds of thousands of custom tracks, adding dense traffic vector layers may slightly impact client-side framerates.

### Approach 2: Backend-Supported Integration (Ingestion & Redistribution)
If the project specifically requires backend support (e.g., using traffic data for AI-driven routing, storing historical traffic patterns for analytics, or fusing traffic data with other tactical intel).

**How it works:**
1. **Poller (`backend/ingestion/`):** A Python poller connects to a bulk traffic API (like TomTom Flow or local open APIs) periodically.
2. **Processing:** The backend parses the data, maps it to OSM road geometries (using PostGIS), and evaluates congestion.
3. **Distribution:** The backend either serves custom generated vector tiles to the frontend or pushes specific high-priority incident alerts over the existing Websocket (`BroadcastManager`).

**Pros:**
- Allows the backend to make intelligence/routing decisions based on live traffic (e.g., "If road is closed, route drone elsewhere").
- Fuses traffic data natively into the project's own Sovereign Watch architecture.

**Cons:**
- **Extreme Cost/Violations:** Most commercial traffic APIs explicitly forbid downloading and caching their raw data for redistribution. You would have to purchase an expensive "Enterprise Raw Data" license (often tens of thousands of dollars per month).
- **High Complexity:** Matching raw traffic flow lines to your own OSM road geometries in PostGIS is a famously difficult geospatial problem (Map-Matching).

## 3. Recommendations & Next Steps

1. **Adopt Mapbox Traffic Vector Tiles (Frontend-Only):**
   Given the project's current use of Mapbox and Deck.gl, integrating the `mapbox.mapbox-traffic-v1` vector tile layer directly into the frontend map style is the clear winner. It requires minimal code, incurs zero backend technical debt, and falls under standard Mapbox pricing.
2. **Frontend Implementation:**
   - Update the base Mapbox style JSON in `frontend/src/` to include the traffic source.
   - Or, add an `MVTLayer` via Deck.gl using the Mapbox Traffic endpoint.
   - Implement a toggle button in the UI (with proper ARIA attributes per `.jules/palette.md`) to allow users to turn traffic on and off, reducing visual clutter in the high-density tactical interface.
3. **Backend Avoidance:**
   - We should avoid trying to ingest global live traffic data into our PostGIS/Kafka pipeline due to the massive licensing costs and map-matching complexity, unless we restrict it to specific open regional APIs (e.g., local state DOT incident feeds).