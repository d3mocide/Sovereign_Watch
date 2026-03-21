# 2026-03-20-update-env-example.md

## Issue
The `.env.example` file is missing several environment variables that are used in `docker-compose.yml`. This makes it difficult for new developers to set up the environment correctly or know which variables are available for configuration.

## Solution
Compare `docker-compose.yml` with `.env.example` and add all missing variables found in the composition file to the example environment file, organized by their respective services/functions.

## Changes
- Updated `.env.example` and `.env` to include:
    - `POSTGRES_DB=sovereign_watch` in the Database section.
    - Added a new `Orbital Pulse` section with `ORBITAL_TLE_FETCH_HOUR=2`.
    - Added a new `Infrastructure` section with `POLL_FCC_START_HOUR=3`.
    - `RF_RR_FETCH_HOUR=4` in the RF Pulse section.
    - `VITE_API_URL=http://localhost` in the Frontend section.
- Fixed `infra_poller` ingestion logic for FCC towers:
    - Switched join key from `registration_number` (which had inconsistent prefixing like 'A') to `USI` (Unique System Identifier) across `CO.dat`, `EN.dat`, and `RA.dat`.
    - Added support for `POLL_FCC_START_HOUR=-1` to trigger immediate synchronization.
    - Improved CSV parsing robustness by using `latin1` decoding and better field validation.
- Updated `docker-compose.yml` to make `POSTGRES_DB` configurable for the `timescaledb` service.

## Verification
- Confirmed frontend is correctly wired to backend API for tower data.
- Triggered manual FCC sync by setting `POLL_FCC_START_HOUR=-1` and clearing cache.
- Observed `infra_poller` successfully downloading and parsing FCC data.
- Verified database count and field population (pending sync completion).

## Benefits
- Improved developer experience for environment setup.
- Better documentation of available configuration options.
- Consistency between the Docker composition and the environment configuration template.
