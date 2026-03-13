# Task: DopplerWidget Performance Optimization

## Issue
The `DopplerWidget` component performs expensive object instantiation within its main data processing loop. Specifically:
- It creates two `Date` objects per iteration: `new Date(p1.time)` and `new Date(p2.time)`.
- It redundantly parses the same time string multiple times (once as `p2` in iteration `i`, and again as `p1` in iteration `i+1`).

## Solution
Optimize the loop in `frontend/src/components/widgets/DopplerWidget.tsx` by:
1. Using `Date.parse()` instead of `new Date().getTime()`, which avoids creating intermediate `Date` objects.
2. Reusing the parsed timestamp from the previous iteration to halve the number of parsing operations.

## Changes
- Modified `frontend/src/components/widgets/DopplerWidget.tsx`:
    - Initialized `t1` outside the loop.
    - Updated the loop to only parse `p2.time` and store it in `t1` at the end of each iteration.

## Verification
- Created a benchmark script `frontend/benchmark_doppler.js` to measure the performance improvement.
- Baseline: ~8.6ms per 10k points.
- Optimized: ~4.1ms per 10k points.
- Improvement: ~52% reduction in processing time.

## Benefits
- Reduced CPU usage and memory allocations during satellite pass data processing.
- More responsive UI when handling large datasets of pass points.
