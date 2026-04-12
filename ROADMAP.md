# Sovereign Watch: Technical Roadmap (V1.0 Release Candidate)

This document outlines the trajectory for the Sovereign Watch platform. For current system architecture and operational guides, please refer to the [Documentation/](./Documentation/) directory.

## 1. Executive Summary

Sovereign Watch is transitioning from initial feature parity to a **Version 1.0 Release Candidate**. Our focus is shifting from "Core Ingestion" to **Systems Reliability**, **Security Hardening**, and **Operational Maturity**.

- **Strategic Vision**: Reclaiming data sovereignty through active, self-hosted multi-INT fusion on low-power hardware.
- **Current Status**: v0.66.0 — All P0 blockers resolved. Ready to tag **v1.0.0**.
- **Archive**: For a full list of completed milestones, see [COMPLETED_ARCHIVE.md](./agent_docs/COMPLETED_ARCHIVE.md).

---

## 2. P0: V1.0 Release Blockers — ALL COMPLETE ✅

All P0 blockers have been resolved as of v0.66.0. The platform is ready for a v1.0 tag.

| ID | Task Name | Component | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DevOps-01** | CI/CD Maturity | DevOps | ✅ Done | Full pipeline: path-change detection + Lint + Typecheck + Test + Build for frontend and all 8 backend services. |
| **Fix-02** | Replay Mode Cleanup | Frontend | ✅ Done | `TimeControls.tsx` fully wired in `App.tsx`; `onClose` exits replay mode and resets playback state. |
| **Fix-03** | Layer Polish | Frontend | ✅ Done | Satellite footprints live in `OrbitalLayer.tsx` (physics-based radius). Infra hover tooltips wired via `handleHoveredInfra` → `MapTooltip` on 5 layer types. |
| **Fix-04** | Dependency Cleanup | Systems | ✅ Done | `exhaustive-deps` warnings resolved; only 2 intentional `eslint-disable` comments remain in `main.tsx` and `useAuth.tsx`. |

---

## 3. P1: Operational Maturity (Reliability Sprint)

Hardening the platform for autonomous deployment on low-power edge devices (Jetson Nano/Pi 5).

| ID | Task Name | Component | Description |
| :--- | :--- | :--- | :--- |
| **Test-01** | UI Test Coverage | Quality | Initial Playwright E2E tests for the "Golden Path" mission flow. |
| **Test-02** | Unit Test Expansion | Quality | Increase Vitest coverage for mission hooks and layer builders. |

---

## 4. P2: Advanced Intelligence (Active Backlog)

Expanding the depth of our geospatial and infrastructure data sources.

| ID | Task Name | Component | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Geo-04** | FAA NOTAM Integration | Data Eng | ✅ Done | Replaced with OpenAIP global airspace zones (v1.0.4). |
| **FE-43** | Airspace Analytics | Frontend | ✅ Done | 12-type zone filter, event-driven sync, z-order unification (v1.0.4). |
| **Space-05** | Satellite Constellations | Data Eng | ✅ Done | Starlink, OneWeb, Iridium-NEXT already in orbital groups; Kuiper deferred (no public TLEs yet). |
| **Infra-06** | DNS Root Instances | Data Eng | ✅ Done | `dns_root_loop` probes all 13 clusters every 5 min → `dns:root:health`; `GET /api/infra/dns-root`. |
| **Infra-07** | CDN Edge Nodes | Data Eng | ✅ Done | `cdn_edge_loop` fetches Cloudflare PoPs every 6 h → `cdn:edge:nodes`; `GET /api/infra/cdn-nodes`. |
| **Analyt-02** | Mission Stats Namespace | Backend | ✅ Done | `GET /api/stats/mission/activity` and `/tak-breakdown` filter tracks by active mission `ST_DWithin`. |
| **Ingest-07** | Drone Remote ID | Data Eng | 🔜 Deferred | Requires SDR hardware; deferred to SDR-mode milestone. |

---

## 5. P3: Collaborative & Analytical Utility

Future-looking features for distributed operations.

| ID | Task Name | Component | Description |
| :--- | :--- | :--- | :--- |
| **Sync-01** | Multi-User Mission Sync | Backend | Real-time collaborative mission synchronization via WebSockets. |
| **Analyt-01** | Mission Heatmaps | Frontend | Density metrics and historical movement heatmaps over time. |
| **Space-06** | WebGPU Physics | Frontend | Offloading orbital propagation (SGP4) to a headless WebGPU worker. |

---

- **Last Updated**: 2026-04-12 (All P2 items complete except Ingest-07 deferred to SDR milestone).
