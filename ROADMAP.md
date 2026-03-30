# Sovereign Watch: Technical Roadmap (V1.0 Release Candidate)

This document outlines the trajectory for the Sovereign Watch platform. For current system architecture and operational guides, please refer to the [Documentation/](./Documentation/) directory.

## 1. Executive Summary

Sovereign Watch is transitioning from initial feature parity to a **Version 1.0 Release Candidate**. Our focus is shifting from "Core Ingestion" to **Systems Reliability**, **Security Hardening**, and **Operational Maturity**.

- **Strategic Vision**: Reclaiming data sovereignty through active, self-hosted multi-INT fusion on low-power hardware.
- **Current Status**: v0.57.0 (Development). Core pipelines stable; Security & CI/CD gaps identified.
- **Archive**: For a full list of completed milestones, see [COMPLETED_ARCHIVE.md](./agent_docs/COMPLETED_ARCHIVE.md).

---

## 2. P0: V1.0 Release Blockers (Immediate Focus)

These items are considered "Blocking" for a public or multi-user deployment of the platform.

| ID | Task Name | Component | Description |
| :--- | :--- | :--- | :--- |
| **Sec-01** | Authentication & RBAC | Backend | Implement JWT / OAuth2 for API and WebSocket gating (P0 Critical). |
| **DevOps-01** | CI/CD Maturity | DevOps | Move from "Smoke" to Full Validation (Full Lint + All Tests + Build). |
| **Fix-02** | Replay Mode Cleanup | Frontend | Finalize `TimeControls.tsx` wiring and `onClose` navigation (P1). |
| **Fix-03** | Layer Polish | Frontend | Implement Satellite footprints (OrbitalMap) and infra hover tooltips. |
| **Fix-04** | Dep Dependency Cleanup | Systems | Resolve exhaustive-deps warnings and 20+ deferred lint items. |

---

## 3. P1: Operational Maturity (Reliability Sprint)

Hardening the platform for autonomous deployment on low-power edge devices (Jetson Nano/Pi 5).

| ID | Task Name | Component | Description |
| :--- | :--- | :--- | :--- |
| **Ops-01** | Centralized Logging | DevOps | Prometheus/Loki/Grafana integration for system-wide observability. |
| **Ops-02** | Metrics & Dashboards | DevOps | Operational health dashboards (CPU/Temp/Mem/IO/SDR Heat). |
| **Ops-03** | Backup & Recovery | Database | Document and automate TimescaleDB incremental backup rotations. |
| **Test-01** | UI Test Coverage | Quality | Initial Playwright E2E tests for the "Golden Path" mission flow. |
| **Test-02** | Unit Test Expansion | Quality | Increase Vitest coverage for mission hooks and layer builders. |

---

## 4. P2: Advanced Intelligence (Active Backlog)

Expanding the depth of our geospatial and infrastructure data sources.

| ID | Task Name | Component | Description |
| :--- | :--- | :--- | :--- |
| **Geo-04** | FAA NOTAM Integration | Data Eng | Ingest FAA airspace restrictions (TFRs, MOAs, GPS Tests). |
| **FE-43** | Airspace Analytics | Frontend | Pulsing NOTAM markers and real-time aircraft/TFR intersection alerts. |
| **Infra-06** | DNS Root Instances | Data Eng | Monitoring health and latency of the 13 root DNS server clusters. |
| **Infra-07** | CDN Edge Nodes | Data Eng | Mapping edge cache locations for major CDNs (Cloudflare, Akamai). |
| **Space-05** | Satellite Constellations | Data Eng | Automated CelesTrak JSON ingestion for Starlink/OneWeb/Kuiper. |
| **Ingest-07** | Drone Remote ID | Data Eng | OpenDroneID / FAA Remote ID SDR pipeline integration. |

---

## 5. P3: Collaborative & Analytical Utility

Future-looking features for distributed operations.

| ID | Task Name | Component | Description |
| :--- | :--- | :--- | :--- |
| **Sync-01** | Multi-User Mission Sync | Backend | Real-time collaborative mission synchronization via WebSockets. |
| **Analyt-01** | Mission Heatmaps | Frontend | Density metrics and historical movement heatmaps over time. |
| **Space-06** | WebGPU Physics | Frontend | Offloading orbital propagation (SGP4) to a headless WebGPU worker. |

---

- **Last Updated**: 2026-03-29 (V1.0 Readiness Pivot).
