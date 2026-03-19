# 2026-03-14 Fix AIS Ingestion Pipeline

## Issue
AIS (Maritime) data was not appearing on the tactical map after a system restart. Investigation revealed two primary issues in the `ais-poller` service:
1. A missing `await` on the Kafka producer's `send()` call caused messages to be dropped silently during the asynchronous transformation loop.
2. The main streaming loop was blocked on `ws.recv()`, making it unresponsive to dynamic mission area (bounding box) updates from the Redis event bus.

## Solution
1. Refactored `publish_tak_event` to be an `async` function and ensured all calls to it and the underlying Kafka producer are correctly `await`ed.
2. Redesigned the `stream_loop` to be interruptible using an `asyncio.Event` (`reconnect_event`). This allows mission area updates to "kick" the loop out of its waiting state and reconnect to AISStream.io with the new coordinates immediately.
3. Cleaned up redundant and unreachable logic for Class B vessel reports.
4. Enhanced logging to include bounding box verification and heartbeat pings.

## Changes
- **Modified**: [service.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/ingestion/maritime_poller/service.py)
    - Added `reconnect_event` to `MaritimePollerService`.
    - Refactored `stream_loop` to use `asyncio.wait` with a 20s timeout and a reconnection signal.
    - Fixed missing `await` in `publish_tak_event`.
    - Removed redundant `StandardClassBPositionReport` handling.
- **Modified**: [utils.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/ingestion/maritime_poller/utils.py)
    - (Audit only, verified logic for bbox calculation).

## Verification
- **Ais-Poller Logs**: Confirmed connection to `stream.aisstream.io` and reception of `PositionReport` messages. Verified `Published vessel` logs appear after transformations.
- **Kafka Consumption**: Verified messages are reaching the `ais_raw` topic via `rpk topic consume`.
- **Database Persistence**: Confirmed `tracks` table in TimescaleDB is populating with `a-f-S-C-M` (Maritime) entities.
- **Mission Sync**: Verified that `POST /api/config/location` successfully triggers a poller reconnection and synchronizes the frontend's spatial filter.

## Benefits
- Restores real-time maritime situational awareness.
- Improves service stability by correctly handling asynchronous operations and dynamic configuration changes.
- Enhances observability with clearer debug logging for the ingestion pipeline.
