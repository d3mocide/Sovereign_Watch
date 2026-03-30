# Sovereign Watch: Technical Roadmap

This document outlines the trajectory for the Sovereign Watch platform. For current system architecture and operational guides, please refer to the [Documentation/](./Documentation/) directory.

## 1. Executive Summary

Sovereign Watch is transitioning from initial feature parity to a **Version 1.0 Release Candidate**. Our focus is shifting from "Core Ingestion" to "Analytical Utility" and "Collaborative Features."

- **Strategic Vision**: Reclaiming data sovereignty through active, self-hosted multi-INT fusion.
- **Current Status**: Phase 2 (Active). Core pipelines for Aviation (ADS-B), Maritime (AIS), and Orbital (TLE) are stable.
- **Archive**: For a full list of completed milestones, see [COMPLETED_ARCHIVE.md](./agent_docs/COMPLETED_ARCHIVE.md).

---

## 2. Technical Architecture Reference

The platform's "System of Systems" architecture is documented in detail within the following resources:

| Domain        | Documentation                                                                                                                                                                                                          |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ingestion** | [Aviation](./Documentation/pollers/ADSB.md), [Maritime](./Documentation/pollers/AIS.md), [Orbital](./Documentation/pollers/Orbital.md), [Infra](./Documentation/pollers/Infra.md), [RF](./Documentation/pollers/RF.md) |
| **Protocol**  | [TAK Protocol Reference (CoT/Protobuf)](./Documentation/TAK_Protocol.md)                                                                                                                                               |
| **Storage**   | [API Reference (TimescaleDB/PostgreSQL)](./Documentation/API_Reference.md)                                                                                                                                             |
| **Interface** | [UI User Guide](./Documentation/UI_Guide.md)                                                                                                                                                                           |

---

## 3. Backlog (P2)

| ID            | Task Name            | Component | Description                                                                 |
| :------------ | :------------------- | :-------- | :-------------------------------------------------------------------------- |
| **FE-13**     | Mission Labels       | Frontend  | Floating text labels for coverage areas.                                    |
| **Ingest-07** | Drone Remote ID      | Data Eng  | OpenDroneID / FAA Remote ID SDR pipeline (Requires RTL-SDR hardware).       |
| **FE-22**     | Drone Tactical Layer | Frontend  | Implement `DroneLayer.tsx` with rotor icons and `drone_class` color coding. |
| **FE-25c**    | PSAP / 911 Centers   | Frontend  | Static GeoJSON markers for emergency dispatch centers.                      |
| **Ingest-04** | SIGINT Jamming       | Data Eng  | ADS-B Integrity Analysis                                                    |
| **Ingest-14** | GDELT Events Pulse   | Data Eng  | Ingest GDELT GKG GeoJSON (15-min interval) news events.                     |
| **FE-35**     | GDELT News Layer     | Frontend  | Real-time news markers with Tone (Goldstein) and CAMEO filtering.           |
| **Ingest-15** | Space Weather Pulse  | Data Eng  | NOAA SWPC (Kp-index, Solar Flux, Auroral Oval) ingestion.                   |
| **FE-36**     | Env Layers           | Frontend  | Auroral Oval polygon layer and solar activity status widget.                |
| **FE-38**     | Multi-INT Dashboard  | Frontend  | Integrated HUD: Polymarket probabilities, Live TV Grid, and DEFCON Status.  |
| **FE-37**     | RF Band Plan Context | Frontend  | Offline SQLite frequency allocation lookup (FCC/ITU).                       |
| **FE-39**     | Analysis Tab Content | Frontend  | Populate placeholder Analysis tab: historian lag timeline, data freshness calendar heatmap, entity count trends over retention window. |
| **FE-40**     | JS8Call Ops Panel    | Frontend  | Status card in Operations tab: HF bridge connected/disconnected, last message timestamp, active KiwiSDR node count. |

---

## 4. Future Scope (P3)

- **Mission Analytics**: Heatmaps and density metrics over time.
- **Multi-User Sync**: Real-time collaborative WebSocket mission synchronization.
- **SGP4 WebGPU Physics**: Offloading orbital propagation to a headless compute worker.

---

- **Last Updated**: 2026-03-21 (Backlog Update).
