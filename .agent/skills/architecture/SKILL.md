# Architecture - Sovereign Watch

> **CRITICAL:** Sovereign Watch is a distributed intelligence fusion platform using a specific containerized architecture.

## Core Architectural Rules

1.  **Container-First**: The host machine is NOT the runtime environment. All services must run via Docker Compose (`docker-compose.yml`). Modifying code in `backend/ingestion/` (pollers) requires a container rebuild (`docker compose up -d --build <service>`).
2.  **Ingestion Pollers**: Data ingestion is handled exclusively by custom Python-based pollers located in `backend/ingestion/` (e.g., Aviation, Maritime, Satellite).
    *   **Anti-Pattern**: DO NOT use "Redpanda Connect" or "Benthos" for ingestion.
    *   **Threading**: To prevent blocking the `asyncio` event loop in ingestion services, CPU-bound tasks (like `sgp4` TLE parsing) must be offloaded to a thread pool using `asyncio.to_thread`.
    *   **Kafka Producers**: High-throughput Kafka producers must use non-blocking `send` calls coupled with `add_done_callback` for error logging, rather than `await`-ing every send operation.
3.  **Event Streaming**: The system uses **Redpanda** (Kafka-compatible) as the central event bus for the backend. The Kafka broker address is configured via the `KAFKA_BROKERS` environment variable (default: `sovereign-redpanda:9092`).
4.  **Frontend Architecture**: The application uses a **Hybrid Rendering Architecture** for maps. It dynamically imports **Mapbox GL JS** or **MapLibre GL JS** based on the environment, heavily overlaid with **Deck.gl v9** (WebGL2).
5.  **Replay Data**: Replay data processing is centralized in `frontend/src/utils/replayUtils.ts`. It relies on the backend to provide guaranteed time-sorted order (ASC) to avoid client-side sorting.