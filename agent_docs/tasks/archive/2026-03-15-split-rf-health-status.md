# 2026-03-15-split-rf-health-status

## Issue
The "RF Infrastructure" status in the System Health widget was a monolithic entry that showed "Disabled" if commercial keys (RepeaterBook/RadioReference) were missing, even though public sources (ARD/NOAA NWR) were active. This was misleading as it suggested no RF data was being ingested.

## Solution
Split the RF health status into individual entries for each major source to provide granular visibility into what is actually running.

## Changes
- Updated `backend/api/routers/system.py`:
    - Separated `RepeaterBook` and `RadioReference` status checks.
    - Added a `Public RF Assets` entry which is always "Active" (as it doesn't require keys).
    - Changed "Disabled" to "Missing Key" for commercial sources to match the convention used for AIS.

## Verification
- Verified API response via `curl`:
    - `Aviation Tracking`: Active
    - `Maritime AIS`: Active
    - `Orbital Assets`: Active
    - `RepeaterBook`: Missing Key
    - `RadioReference`: Missing Key
    - `Public RF Assets`: Active
    - `AI Analysis`: Disabled
- Frontend automatically renders the new list items.
