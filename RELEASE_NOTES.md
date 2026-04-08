# Release - v1.0.0 - Convergence

Sovereign Watch has reached its first major milestone. Version 1.0.0, codenamed **"Convergence"**, formalizes the platform's shift from a multi-sensor tracker to an active Intelligence Fusion engine. 

## High-Level Summary

This release activates the cross-domain risk assessment framework, enabling the platform to automatically detect and escalate high-threat scenarios where electronic warfare, maritime distress, and OSINT signals align. By correlating GPS integrity losses with physical movement and global news events, Sovereign Watch provides a unified "Strategic Sitrep" that was previously fragmented across separate views.

## Key Features

- **Multi-Domain Risk Fusion**: Full integration of Maritime (AIS), Aviation (ADS-B), OSINT (GDELT), Space (SatNOGS/NOAA), and Infrastructure (IODA/PeeringDB) into a single H3-based scoring model.
- **Convergence Boost logic**: Automatic 1.2x multiplier for risk scores in cells where multiple threat domains overlap.
- **Temporal Memory**: Implemented a 4-hour exponential decay window for data-derived risk, ensuring the map reflects immediate operational reality.
- **Security Baseline**: Hardened API error handling to prevent sensitive database metadata leakage.

## Technical Details

- **Database**: TimescaleDB hypertables optimized for multi-domain risk persistence and cross-region correlation.
- **Redpanda**: Real-time event bus now handles high-concurrency cross-domain evaluation requests via `EscalationDetector`.
- **Relocated Tests**: Stress testing for risk fusion is now part of the core CI battery (`backend/api/tests/test_risk_fusion.py`).

## Upgrade Instructions

To upgrade to the first major stable release:

```bash
# Pull latest changes
git pull origin dev

# Rebuild and restart services
make dev
```

---
*Sovereign Watch — Unified Intelligence for a Distributed World.*
