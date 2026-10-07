# Running Stack Performance Assessment

## Issue

Assess current performance and identify improvements after build and retention
recovery. This is a measured review, not an optimization rollout or capacity test.

## Solution

Sample container resource use, request latency, consumer offsets, disk writes,
and database statistics; review the corresponding hot paths.

## Changes

Added this report only. No application or runtime settings changed.

## Verification and findings

- Four Docker resource snapshots over 42.6 seconds: aggregate sampled CPU
  approximately 61% of one core (about 10% of this six-vCPU VM). These are sparse
  snapshots and may miss short bursts; this is not a saturation/load test.
- Mean CPU by service, where 100% means one fully busy CPU core:
  API 23.51%, space-pulse 16.70%, clausalizer 5.60%, Postgres 4.98%,
  Redpanda 3.49%, Redis 1.70%. API peaked at 61.14% in the sample.
- Approximate memory: API 241 MiB, space-pulse 109 MiB, Postgres 688 MiB,
  Redpanda 735 MiB. Host has approximately 4.6 GiB available; a small amount
  of occupied swap alone does not demonstrate active swapping.
- Fifteen sequential local requests per path: web entry median 1.99 ms,
  API health median 3.25 ms, observed maxima 21.24 ms and 11.15 ms.
  These measurements exclude browser download/rendering and authenticated
  analytics endpoints; they do not establish many-user performance.
- Orbital logs repeatedly show 12,732 satellites per sweep, approximately
  34.6–35.0 seconds processing plus one second sleep. Configured target is
  15 seconds. The pipeline cannot achieve its configured refresh interval.
- Space producer uses 50 ms linger, default 16 KiB batches, JSON serialization,
  and no compression. Orbital code also sleeps 100 ms after each 500-send
  tranche. Attribution between computation, serialization, and Kafka waiting
  needs instrumentation before changing cadence.
- Broadcast decodes JSON and converts each live message to TAK Protobuf,
  including when no clients are connected, to maintain its last-value cache.
  Initial snapshots send individual frames, although ongoing traffic uses
  coalesced batch frames. These are candidates for profiling/optimization.
- Cold metrics invocation measured 918.93 ms with a maximum event-loop tick
  gap of 203.38 ms. The cached invocation took 0.31 ms. Source explicitly
  calls blocking psutil.cpu_percent(interval=0.2) in an async handler, then
  creates transient Kafka admin/consumer clients on cache misses. The stats
  dashboard polls every ten seconds while the cache lasts five seconds.
- Consumer lag checked using aiokafka end offsets: historian snapshot showed
  1,020 orbital messages, 84 ADS-B messages, and 2 AIS messages outstanding;
  clausalizer showed 57 ADS-B and 1 AIS. A single committed-offset snapshot
  includes commit cadence and does not demonstrate growing processing backlog.
  rpk displayed TOTAL-LAG 0 but also missing-end-offset errors; its zero was
  not accepted as evidence that the groups are caught up.
- Postgres cumulative stats show 4,728 MiB of temporary writes, 88.2% buffer
  hit rate, and zero deadlocks. stats_reset is null, so this includes historical
  workload/catch-up; no current query attribution is available because
  pg_stat_statements is not enabled. Do not tune memory from these totals alone.
- Recent five one-minute host samples: roughly 60–86 MB written per minute.
  Startup/build/compression inflated the collector's session average; use a
  separate steady-state window and a 24–72-hour baseline for endurance planning.
- Redis has zero evictions and delayed AOF fsyncs. Both AOF and periodic RDB
  persistence are configured. Persistent watchlists/state must be identified
  before proposing cache-only durability changes.
- Some upstream aviation feeds are failing, so the observed workload is not
  the full healthy-source workload. Browser FPS and multiple-client scaling
  were not measured. No code suites needed for a documentation-only change.

## Recommended order

1. Move system sampling off the API event loop; reuse or background-sample Kafka
   lag clients. Low scope, directly reproduced latency stall.
2. Instrument orbital stages; benchmark larger producer batches and compression
   against freshness, CPU, and disk-write metrics. Avoid blindly increasing
   update rates, which can increase write volume even when latency improves.
3. Consider encoding TAK once at ingestion, separating infrequently changing
   catalog metadata from position updates, and coalescing initial snapshots.
   Preserve the last-value cache and late-join behavior. This is a broader
   shared protocol change, not a local serializer swap.
4. Add query attribution with pg_stat_statements through the proper Compose/
   migration workflow; optimize proven expensive analytics queries and cache
   identical cross-client requests before raising global work_mem.
5. Profile the browser with representative entity counts and both map engines
   before changing rendering. Existing workers, binary icon attributes, frame
   pacing, and vendor splitting already implement substantial optimizations.

## Benefits

Prioritizes a demonstrated latency stall and satellite freshness problem while
avoiding speculative hardware upgrades or global memory/durability changes.

## References

- [aiokafka batching and compression](https://aiokafka.readthedocs.io/en/stable/examples/serialize_and_compress.html)
- [psutil blocking sampling behavior](https://psutil.readthedocs.io/stable/)
- [Postgres query statistics](https://www.postgresql.org/docs/current/pgstatstatements.html)
