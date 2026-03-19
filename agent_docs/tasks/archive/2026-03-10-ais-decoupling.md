# AISStream Geofence Decoupling

## Issue
The AISStream.io WebSocket was being rapidly disconnected and reconnected every time the user adjusted the `COVERAGE_RADIUS_NM` mission slider in the UI. Because AISStream limits connection attempts, this rapid bounding box recreation resulted in severe rate limiting and data loss.

## Solution
Decoupled the backend WebSocket ingestion bounding box from the dynamic frontend reporting boundary.
1. **Fixed WebSocket Bounding Box**: The backend now always connects to AISStream using a fixed 350nm bounding box around the center coordinate. Changing the radius in the UI no longer drops the connection.
2. **Local Distance Filter**: Added a `calculate_distance_nm` Haversine function. The `stream_loop` now evaluates every incoming position report against the user's *current dynamic radius* and silently drops vessels outside that radius *before* publishing them to Kafka/Redpanda.

## Changes
- `backend/ingestion/maritime_poller/utils.py`:
  - Added `calculate_distance_nm` to calculate great-circle distances.
- `backend/ingestion/maritime_poller/service.py`:
  - **navigation_listener**: Excluded `radius_diff` from the `MIN_RADIUS_CHANGE_NM` threshold that triggers reconnects.
  - **connect_aisstream**: Hardcoded the requested `bbox` generation to `350` nm instead of `self.radius_nm`.
  - **stream_loop**: Intercepts `PositionReport` and `StandardClassBPositionReport` messages, verifies their distance to the center coordinate, and only passes them to the Kafka producer if `dist <= self.radius_nm`.

## Verification
- Rebuilt `ais-poller` docker container.
- Adjusted radius locally and observed the poller logs to confirm that the WebSocket was no longer disconnecting.
- Confirmed that vessels beyond the dynamic radius were successfully filtered prior to Kafka ingestion.

## Benefits
- **Zero-Latency Radius Scaling**: Users can slide the coverage radius on the map, and ships will appear/disappear instantly because the backend is already "pre-fetching" up to 350nm.
- **Improved API Standing**: A stable, long-lived WebSocket connection complies with AISStream fair-use policies, dramatically reducing the chance of an IP ban.
- **Reduced Message Bus Load**: Despite fetching a 350nm firehose, the poller locally truncates the data to the user's area of interest before hitting Redpanda, saving network/storage overhead.
