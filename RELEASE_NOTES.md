# Release Notes - v0.37.1 (Situational Intelligence)

## Multi-Domain AI Analyst Integration

v0.37.1 marks a critical advancement in our AI Analyst's cognitive capabilities, moving from simple telemetry summary to **true multi-domain situational awareness**. By fusing cross-referenced datasets at the analysis prompt level, the AI can now assess not just *where* a target is, but its **intent** relative to global infrastructure and the orbital sensor environment.

### 🦾 Key Capabilities:

1. **Behavioral Trajectory Insight**:
   - The AI Analyst now receives a detailed 10-point waypoint history (Lat/Lon, Alt, Speed, Time).
   - This prevents "average-velocity" masking and helps the AI detect loitering, course shifts, and rendezvous behaviors.

2. **Infrastructure Proximity Awareness**:
   - **RF Pulse Correlation**: Automatically identifies if a target is hovering within 10km of a critical radio repeater or signal site.
   - **Submarine Cable Intelligence**: Cross-references targets with world-wide undersea landing stations (cached in Redis), flagging potential security threats to global connectivity.

3. **Orbital Domain Fusion**:
   - **Overpass Detection**: The Analyst now "looks up." Using integrated SGP4 propagation, the AI determines if active INTEL-category satellites are currently overpassing the target's position.
   - This provides the Analyst with the context of whether a target is being shadowed by an orbital sensor.

4. **Synthetic Satellite Telemetry**:
   - Added a fallback synthesis mode for satellites using TLE-based SGP4 propagation. This ensures that even without real-time telemetry, the Analyst can provide high-fidelity assessments based on predicted orbits.

### 🛠️ Stability:
- Fixed a JSON decoding issue that caused the Analyst to crash when processing waypoint historical data from the database.
- Improved the LiteLLM dynamic model mapping to correctly handle environment-injected API keys from `litellm_config.yaml`.

---
*For a full list of changes, see the [CHANGELOG.md](CHANGELOG.md).*
