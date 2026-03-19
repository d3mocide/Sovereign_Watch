# 2026-03-11 Internet Outage Data Synchronization Fix

## Issue
The IODA (Internet Outage Detection and Analysis) data shown on the tactical map did not match the live IODA dashboard. Specifically, major ongoing outages (e.g., Iran, Ethiopia) were missing, and the severity mapping was inconsistent with the visual representation on the IODA website.

## Solution
1.  **Endpoint Transition**: Switched the `infra_poller` from the `/v2/outages/alerts` endpoint to the `/v2/outages/summary` endpoint. The `/alerts` endpoint only reflects *newly detected* anomalies, meaning ongoing outages that started outside the 24-hour polling window were missed. The `/summary` endpoint provides a consolidated "Overall Score" for all active disruptions in the requested timeframe.
2.  **Severity Normalization**: Implemented a logarithmic scale to map IODA's raw "Overall Score" (which can range from 1K to hundreds of billions) to a 0-100% severity percentage. This ensures that massive outages like Iran's (`~350G` score) result in a high severity (Red) on our map, while minor fluctuations stay in the Yellow/Orange range.
3.  **UTC Window Refresh**: Confirmed and strictly enforced the use of a dynamic 24-hour UTC lookback window (`now` - 86,400 seconds) for all API requests.

## Changes
- **Modified**: `backend/ingestion/infra_poller/main.py`
  - Replaced `/v2/outages/alerts` with `/v2/outages/summary`.
  - Updated `fetch_internet_outages` to parse the `summary` data structure.
  - Added `math.log10` based normalization for severity mapping.
  - Refined geocoding fallback logic.

## Verification
- **Redis Inspection**: Confirmed `infra:outages` key contains `outage-IR` (Iran) with severity `96.2` and `outage-ET` (Ethiopia) with severity `30.6`.
- **Log Verification**: `infra_poller` logs confirm successful storage of 26+ country-level outages from the summary feed.
- **Visual Match**: The localized shading and severity colors now align with the patterns seen on `ioda.inetintel.cc.gatech.edu`.

## Benefits
- Accuracy: The map now reflects real-time global internet connectivity status rather than just recent change alerts.
- Consistency: Severity scores now scale appropriately with the magnitude of the disruption.
- Reliability: Robust handling of ongoing, long-duration outages.
