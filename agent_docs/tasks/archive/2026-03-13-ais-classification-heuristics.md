# AIS Classification Heuristics Expansion

## Date
2026-03-13

## Issue
After a full Docker storage wipe and container restart, all vessels in the Intelligence Stream were displayed with `[UNKNOWN]` classification tags. This was expected for the first few minutes (while static data reports populate the cache), but many common vessels like WSF ferries and Foss tugs remained unclassified indefinitely.

## Root Cause
1. **Narrow Heuristics**: The name-based fallback in `classification.py` only matched generic terms like "TUG" or "YACHT", but didn't include fleet prefixes like "WSF" (Washington State Ferries), "FOSS", or vessel patterns like "SPIRIT OF".
2. **Missing Field**: `handle_static_data` in `service.py` only checked for a `Name` field, but some `ShipStaticData` messages (Message 5) may carry the vessel name under `ShipName`.

## Solution
### `classification.py`
- Expanded the name-based heuristic block to include:
  - **Tug**: `FOSS`, `PUSH`, `VALIANT`, `TITAN`, `TOW`
  - **Passenger**: `WSF`, `FERRY`, `SPIRIT`, `QUEEN`, `BREEZE`
  - **Military**: `USS `, `USNS`, `CGC`, `RFA`
  - **Fishing**: `CRABBER`
  - **Pleasure**: `MY `, `M/Y`, `SY `
  - **Law Enforcement**: `POLICE`, `SHERIFF`, `PATROL`
  - **SAR**: `SAR` (broadened from `SAR `)

### `service.py`
- Updated `handle_static_data` to fall back to `ShipName` if `Name` is not present in the static data message.

## Changes
- `backend/ingestion/maritime_poller/classification.py` — expanded heuristic keyword lists.
- `backend/ingestion/maritime_poller/service.py` — added `ShipName` fallback in `handle_static_data`.

## Verification
- Rebuilt `ais-poller` container.
- Confirmed container connected to AISStream.io successfully.
- Classification tags for WSF ferries and Foss tugs expected to appear within ~2 minutes of initial data stream.

## Benefits
- Significantly reduces the number of vessels permanently showing as `[UNKNOWN]` in the Intelligence Stream.
- Covers common PNW maritime fleet identifiers (WSF, Foss, USCG) out of the box.
- Resilient to AIS data latency — correct tags applied even before static type data arrives.
