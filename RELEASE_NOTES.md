# Release — v0.7.3 — "Deep Water Intel"

## Summary

v0.7.3 is a major intelligence expansion patch that substantially upgrades Sovereign Watch's maritime data processing and tactical filtering capabilities. We've enhanced the backend ingestion poller to capture and cache rich vessel classification metadata, pushed those changes through the TAK protobuf pipeline, and overhauled the entire frontend to take advantage of these new capabilities.

The update introduces granular display filtering for sea and air assets, unifies map and feed display logic, streamlines the UI, and highlights highest-priority tactical items with our new "Tactical Orange" visual language.

---

## What's New

### Advanced Maritime Classification (Backend & Protocol)

- **Extended AIS Subscriptions**: The Maritime Poller now listens for `ShipStaticData` and `StandardClassBPositionReport` in addition to basic position streams.
- **Stateful Vessel Cache**: Implemented a memory-managed static data cache to join metadata (ship type, dimensions, destination, flag) onto fast-moving position reports, with automatic garbage collection for memory safety.
- **TAK Protocol Extension**: Updated `tak.proto` with deep `vesselClassification` to carry the new enriched metadata downstream to clients.

### Granular Filtering Matrix (Frontend)

- **Expanded Sea Categories**: Operators can now filter the tactical picture by specific vessel classifications including Cargo, Tanker, Passenger, Fishing, Military, Law Enforcement, SAR, Tug, Pleasure, HSC, and Pilot.
- **Aerial Drones**: Added direct filter support for uncrewed platforms (Drones) distinct from general aviation and helicopters.
- **Smart "Special" Fallback**: Entities categorized as 'unknown' or 'special' are now intelligently bundled into the "Show Special" filter, minimizing UI clutter while preserving full operational awareness.
- **Unified Logic**: Both the `IntelFeed` and `TacticalMap` (including Live and Replay modes) have had their filtering algorithms completely harmonized to ensure identical behavior.

### Tactical UI Polish

- **Special Entity Highlighting**: To rapidly direct operator attention, high-value assets (SAR, Military, Law Enforcement vessels + Helicopters and Drones) are now outlined on the tactical map with a glowing "Tactical Orange" (#FF8800) shadow, and their tags in the target inspector side-panel have been recolored to match.
- **HUD Streamlining**: Removed the redundant "Active Collection Filters" header from the UI configuration panel to maximize map visibility.

---

## Upgrade

```bash
git pull
docker compose up -d --build
# Due to protocol buffer changes, rebuild the backend and frontend entirely.
```

---

## Known Issues

- **CoT Tracking:** Native Cursor-on-Target entity tracking remains non-functional (scheduled).
- **Residual Jitter:** Occasional sub-second jitter may still occur on MLAT-only aircraft with no transponder course field; investigation ongoing.
