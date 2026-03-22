# Spectrum Verification Panel: UI Shape Mismatch Fix

**Date:** 2026-03-21  
**Status:** Complete

## Issue

The `Spectrum_Verification` panel in `SidebarRight.tsx` would open when a satellite was selected in Orbital View but displayed only "STATUS:" with no data. The panel appeared to be fully wired up (the `fetchSatnogsVerification` prop was present and the API call was firing), but nothing rendered.

## Root Cause

The panel was written to consume a different response shape than what the `/api/satnogs/verify/{norad_id}` endpoint actually returns:

| UI checked for | Actual API field |
|---|---|
| `verificationData.status` | (doesn't exist — must be computed) |
| `verificationData.anomalies[]` | `verificationData.summary.anomalous` (count) |
| `verificationData.observations[]` | `verificationData.recent_observations[]` |
| (no known transmitters display) | `verificationData.known_transmitters[]` |

Because `verificationData.status` was `undefined`, all conditional renders fell through and the panel body was empty.

There was a secondary issue: `space_pulse` polls SatNOGS Network observations on a **1-hour interval**, so on a fresh restart there are zero observations in the database. The old UI had no useful state for this case.

## Solution

Rewrote the Spectrum Verification panel render block in `SidebarRight.tsx` to:
1. Map correctly to the real API shape (`summary`, `known_transmitters`, `recent_observations`).
2. Derive `STATUS` label from `summary.anomalous` and `summary.total_observations`.
3. Show **KNOWN TX** entries (frequency + mode) even when there are no recent observations yet.
4. Show a **RECENT OBS** block that color-codes anomalous entries in red and matched entries in green.
5. When there are 0 observations but ≥1 catalogued transmitter, show `"N tx catalogued · no observations yet"` instead of a blank panel.

## Changes

- **`frontend/src/components/layouts/SidebarRight.tsx`** — Rewrote the `{/* Spectrum Verification Panel */}` JSX block (lines 160–203) to match actual API response shape.

## Verification

- `curl http://localhost/api/satnogs/verify/42841` returns valid JSON with `known_transmitters` array and an empty `recent_observations` array (observations will populate after `space_pulse` first polls SatNOGS Network, which happens on a 1-hour interval after container start).
- The panel now shows `STATUS: NO DATA`, the 1 known TX entry at `402.700 MHz / FM`, and the message `"1 tx catalogued · no observations yet"`.
- Once `space_pulse` has polled at least once, the STATUS will update to `VERIFIED` or `ANOMALY` based on frequency matching.

## Benefits

- Panel is no longer silently blank — it always shows meaningful state even before observations exist.
- STATUS label is correctly derived from the backend summary.
- Anomalous observations (frequency doesn't match any catalogued transmitter) are highlighted in red.
