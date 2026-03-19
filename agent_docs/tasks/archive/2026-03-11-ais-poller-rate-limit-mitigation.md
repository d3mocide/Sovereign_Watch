# 2026-03-11-ais-poller-rate-limit-mitigation.md

## Issue
The AIS poller was frequently hitting rate limits on AISStream.io, especially when the user moved mission areas or during network instability. The previous logic used a static 5-second retry which was often flagged as "hammering" by the API.

## Solution
Implemented a multi-layered connection management strategy to protect the user's IP and improve service stability:
1.  **Reconnection Cooldown**: Enforces a minimum of 30 seconds between ANY two reconnection attempts. This prevents rapid reconnect cycles if the user pans the map quickly across large distances.
2.  **Exponential Backoff**: If a connection attempt fails, the next retry delay doubles (starting at 5s, then 10s, 20s, 40s...), up to a maximum of 5 minutes.
3.  **Jitter**: Adds +/- 10% random noise to retry delays to avoid predictable request patterns that can be flagged by anti-bot systems.
4.  **Stability Threshold**: The backoff counter only resets after the connection has remained stable and active for at least 60 seconds.

## Changes
- **[MODIFY] [service.py](file:///d:/Projects/SovereignWatch/backend/ingestion/maritime_poller/service.py)**:
    - Added state tracking for `last_reconnect_time`, `reconnect_attempts`, and `connection_start_time`.
    - Integrated cooldown and backoff logic into the main `stream_loop`.

## Verification
- Verified logic via code review of the `stream_loop` state transitions.
- The poller will now log: `⏳ Rate limit protection: Waiting ...s before next AISStream reconnect` or `🔄 AISStream retry backoff: attempt X, waiting ...s` when mitigations are active.
