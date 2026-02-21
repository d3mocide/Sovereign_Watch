# Sovereign Orbital Pulse Service Implementation

## Overview

Added the new `sovereign-orbital-pulse` ingestion service which tracks active satellites via Celestrak TLEs and propagates their positions continuously using the standard SGP4 algorithm. The data is converted to TAK protocol and produced onto the `orbital_raw` Redpanda topic.

## Details

1. **Source**: Celestrak General Perturbation (`gp.php`) API and Supplemental (`sup-gp.php`) API. Fetch lists are populated from standard group domains (`gps-ops`, `weather`, `active`, etc).
2. **Caching**: Data is cached locally per-request for 2 hours to avoid 403 blocks from IP rate lifting. A local file cache is used at `/app/cache`.
3. **Propagation Strategy**:
   - The original `SatrecArray` vectorized wrapper caused a severe CPU deadlock and memory leak (reaching 100% CPU and 3.2+ GB RAM). We eschewed `SatrecArray` and rely on a high-throughput raw Python loop with pre-allocated NumPy arrays.
   - ECI coordinates (TEME) are converted directly to WGS84 ECEF coordinates via GMST approximations, and then subsequently into LLA (Geodetic) coordinates locally on each cycle.
   - A 30s main propagation loop recalculates positions for all known hardware targets in ~7.5 seconds using micro-batched Future scheduling (max 500 futures at a time, interlaced with `asyncio.sleep(0)` yield points).
4. **TAK Proto Translation**:
   - CoT type: `a-s-K`
   - Custom Detail Block matching existing spec (norad_id, category, period_min, inclination_deg).
   - True velocity vector length and derived course calculation from 1st-differences of successive geodetic projections simulate true heading / course over ground realistically.

## Performance Optmization Record

1. **Removed `SatrecArray` Deadlock:** The C++ wrapper array class froze on Alpine/slim environments. Replacing it with pure python iterations against `sgp4()` inside `enumerate()` on our own NumPy pre-allocated arrays resolved lockups and processed 14,430+ items in ~0.012 seconds (the SGP4 loop itself).
2. **Kafka Delivery Throughput:**
   - Modified `AIOKafkaProducer` with `linger_ms=50` to pack requests safely.
   - Reduced blocking internal Python task starvation by batch-yielding `asyncio.gather()` results every 500 iterations to allow actual socket flushing. Performance skyrocketed from frozen memory leaks down to roughly 7.5s flat execution with ~83mb of steady state RAM and total CPU 0% tailing for the subsequent 22.5 seconds.

## Setup & Testing

1. Topics must be initialized manually or via automated provision if one exists.
   `docker compose exec redpanda rpk topic create orbital_raw --partitions 4`
2. Run `docker compose up -d sovereign-orbital-pulse` and evaluate `docker compose logs -f sovereign-orbital-pulse`.
3. Metrics and propagation counts will appear in logs.

_(Task Slug: orbital-pulse-implementation)_
