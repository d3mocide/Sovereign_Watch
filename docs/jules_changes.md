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
