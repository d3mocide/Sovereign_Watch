
# Jules Changes

# Security Fix: Tracks History Validation

## Issue
The `get_track_history` endpoint in `backend/api/routers/tracks.py` lacked input validation for `limit` and `hours` query parameters. This could allow excessive data retrieval, potentially leading to Denial of Service (DoS) or performance degradation.

## Solution
Implemented input validation to enforce maximum limits on `limit` and `hours`.

## Changes
1.  **Configuration:** Added `TRACK_HISTORY_MAX_LIMIT` (default: 1000) and `TRACK_HISTORY_MAX_HOURS` (default: 72) to `backend/api/core/config.py`. These are configurable via environment variables.
2.  **Implementation:** Updated `get_track_history` in `backend/api/routers/tracks.py` to:
    *   Check if `limit` exceeds `TRACK_HISTORY_MAX_LIMIT`.
    *   Check if `hours` exceeds `TRACK_HISTORY_MAX_HOURS`.
    *   Return `400 Bad Request` if limits are exceeded.
3.  **Testing:** Added `backend/api/tests/test_tracks_validation.py` to verify validation logic.

## Verification
Tests confirm that requests exceeding limits are rejected with `400 Bad Request`, while valid requests proceed (returning 503 if DB is not ready, or 200 otherwise).

# Code Health Improvement: Hardcoded Kafka Broker Configuration

## Issue
The Kafka broker address was hardcoded as `'sovereign-redpanda:9092'` in `backend/api/routers/tracks.py` and `backend/api/services/historian.py`. This prevented configuration via environment variables, which is standard practice for containerized applications.

## Solution
1.  **Configuration Update**: Added `KAFKA_BROKERS` to the `Settings` class in `backend/api/core/config.py`. It defaults to `'sovereign-redpanda:9092'` but can be overridden by the `KAFKA_BROKERS` environment variable.
2.  **Refactoring**: Updated `backend/api/routers/tracks.py` and `backend/api/services/historian.py` to use `settings.KAFKA_BROKERS`.

## Verification
-   Ran existing tests (`pytest backend/api/tests/test_cors.py`).
-   Verified that the `settings` object correctly loads the default value.
-   Verified that the refactored modules can be imported without errors.

## Benefits
-   **Configurability**: The application can now be deployed in different environments with different Kafka broker addresses without code changes.
-   **Maintainability**: The Kafka broker address is defined in a single place (`backend/api/core/config.py`), reducing duplication and the risk of inconsistencies.

## 2024-05-24: Fix Globe Mode Icon Rendering

### Problem
In Globe projection mode, entity icons (aircraft/vessel chevrons) and satellite markers (diamonds) were failing to render. This was caused by a conflict between Deck.gl's `IconLayer` properties when `billboard: true` is combined with `wrapLongitude: true` in the Globe view. Additionally, conflicting `depthTest` settings in the tactical halo and heading arrow layers exacerbated the issue.

### Solution
- **`frontend/src/layers/buildEntityLayers.ts`**:
    - Disabled `wrapLongitude` for `heading-arrows` and `entity-tactical-halo` layers when `globeMode` is active.
    - Forced `depthTest: false` for `heading-arrows` to ensure icons always render on top of the terrain, aligning with the inline comments.
- **`frontend/src/layers/OrbitalLayer.tsx`**:
    - Disabled `wrapLongitude` for `satellite-markers` when the projection mode is 'globe'.
- **`frontend/src/layers/buildJS8Layers.ts`**:
    - Disabled `wrapLongitude` for `js8-labels` in Globe mode to prevent billboarding conflicts.

### Verification
- **Scenario**: Switch to Globe view.
- **Expected**: Aircraft chevrons, Vessel chevrons, and Satellite diamonds should now appear correctly on the globe surface, maintaining their billboard orientation towards the camera without z-fighting or disappearance.

## 2026-02-25: Implement tests for TAK Protocol utilities

### Issue
Missing tests for TAK protocol utilities in `backend/api/services/tak.py`, specifically `to_epoch`, `to_float`, and `transform_to_proto`.

### Solution
Implemented comprehensive unit tests for all TAK protocol utility functions.

### Changes
- **Testing**: Created `backend/api/tests/test_tak_utils.py` with tests for:
    - `to_epoch`: Handles None, numeric inputs, ISO strings (with/without 'Z'), and invalid strings.
    - `to_float`: Handles None, valid numeric inputs, and invalid inputs with custom defaults.
    - `transform_to_proto`: Verifies mapping of complex JSON data to Protobuf fields and ensures the 3-byte magic header (`0xbf01bf`) is correctly prepended.

### Verification
- Ran utility tests using `pytest backend/api/tests/test_tak_utils.py`.
- Verified `to_epoch` and `to_float` pass correctly.
- `transform_to_proto` tests verify correct Protobuf serialization and field mapping.
- Confirmed test sensitivity by intentionally breaking `to_epoch` and observing failure.

### Benefits
- **Reliability**: Ensures critical data transformation logic is correct.
- **Maintainability**: Provides a safety net for future refactoring of the TAK protocol implementation.
# Performance Optimization: Broadcast WebSocket Service

## Issue
The WebSocket endpoint `/api/tracks/live` created a new `AIOKafkaConsumer` for every connected client. This resulted in O(N) resource usage (connections, memory) and redundant data processing (JSON parsing + Protobuf serialization done N times for the same message).

## Solution
Implemented a centralized `BroadcastManager` service that consumes from Kafka once and broadcasts the serialized data to all connected clients.

## Changes
1.  **New Service:** Created `backend/api/services/broadcast.py`.
    *   Manages a single `AIOKafkaConsumer`.
    *   Maintains a set of active WebSocket connections.
    *   Handles message transformation (JSON -> Proto) once per message.
    *   Broadcasts to all clients concurrently using `asyncio.gather`.
    *   Implements timeout protection (0.5s) to disconnect slow clients and prevent head-of-line blocking.
2.  **Lifecycle Integration:** Updated `backend/api/main.py` to start/stop the `broadcast_service` on application startup/shutdown.
3.  **Refactoring:** Updated `backend/api/routers/tracks.py` to delegate connection management to `broadcast_service` instead of managing its own consumer.
4.  **Testing:** Created `backend/api/tests/benchmark_sockets.py` and `backend/api/tests/mock_server.py` to measure performance.

## Verification
-   **Benchmark Results (100 Concurrent Clients):**
    -   **Baseline:** ~3,400 messages/sec total throughput (~34 msg/s per client).
    -   **Optimized:** ~5,350 messages/sec total throughput (~53 msg/s per client).
    -   **Improvement:** ~1.57x throughput increase.
-   **Resource Efficiency:** Reduced Kafka consumers from N to 1. Reduced Protobuf serializations from N to 1 per message.

## Benefits
-   **Scalability:** The server can handle significantly more concurrent clients with lower CPU and memory overhead.
-   **Stability:** Isolated slow clients (timeout disconnect) to prevent them from affecting the real-time feed for others.


# Performance Optimization: Maritime Poller Throughput

## Date
2026-02-25

## Issue
The maritime poller was experiencing low throughput due to blocking Kafka `send` operations inside the main ingestion loop. Each message was awaited individually, causing the loop to pause for the round-trip time to the Kafka broker.

## Solution
Optimized the `stream_loop` in `backend/ingestion/maritime_poller/service.py` to use non-blocking Kafka sends.
- Removed `await` from `self.kafka_producer.send(...)`.
- Added a completion callback (`on_send_error`) to the returned Future to ensure send errors are logged.
- Fixed a bug where `websockets.exceptions` was not imported correctly.

## Changes
- Modified `backend/ingestion/maritime_poller/service.py`:
    - Removed `await` keyword from `kafka_producer.send` calls.
    - Attached `add_done_callback(self.on_send_error)` to the send futures.
    - Added `on_send_error` method to log exceptions.
    - Added `import websockets.exceptions` to fix `NameError` on connection handling.

## Verification
- Created a benchmark script `benchmark.py` mocking `AIOKafkaProducer` (with 2ms simulated latency) and `websockets`.
- **Baseline**: ~432 msg/sec (2.31s for 1000 msgs).
- **Optimized**: ~15,487 msg/sec (0.06s for 1000 msgs).
- Validated that existing backend API tests still pass.

## Benefits
- **35x Throughput Increase**: The poller can now ingest messages at a rate limited primarily by CPU processing rather than network latency.
- **Improved Resilience**: The loop is less likely to lag behind the realtime WebSocket stream, reducing the risk of buffer overflows or disconnections.

