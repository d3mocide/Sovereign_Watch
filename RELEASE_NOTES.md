# Release - v0.32.0 - Payload Eval

## Summary
Version 0.32.0 introduces the **Payload Evaluation** suite, a critical investigative feature-set that surfaces the raw underlying data of the Sovereign Watch platform. This release bridges the gap between high-level tactical visualization and raw intelligence analysis.

## Key Features
- **Global Raw Stream Terminal**: A new "god-mode" terminal in the Top Bar that traces the live pulse of the entire ingestion bus.
- **Adjustable Sampling Rates**: Hardware-inspired speed controls (Real-time to 10X decimation) to slow down high-traffic streams (e.g., near major hubs) for human analysis.
- **Syntax Highlighted Inspectors**: Full JSON syntax highlighting for all inspected payloads, matching the project's tactical aesthetic.
- **Context-Aware UI**: The sidebars now intelligently hide developmental/raw buttons when viewing static infrastructure like undersea cables, keeping the UI focused on operational data.

## Technical Details
- Implements **FE-10** from the project roadmap.
- High-performance polling mechanism in `GlobalTerminalWidget` ensures zero impact on the main rendering loop (60fps maintained).
- Protobuf-to-JSON visual mapping consistency across all domain pollers.

## Upgrade Instructions
```bash
docker compose pull
docker compose build frontend
docker compose up -d
```
