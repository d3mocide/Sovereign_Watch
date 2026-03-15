# System Health Widget

**Date:** 2025-02-14
**Feature:** System Health Checker Widget
**Status:** Completed

## Overview
Added a new "System Health" widget to the frontend top bar to monitor the configuration status of various data ingestion streams (Aviation, Maritime, Orbital, RF, AI) based on the presence of required API keys in the backend environment. This replaces the originally planned "Settings UI" to avoid exposing sensitive keys to the client.

## Changes Made
- **Backend:** Created `/api/config/streams` endpoint in `backend/api/routers/system.py` to evaluate environment variables (`AISSTREAM_API_KEY`, `REPEATERBOOK_API_KEY`, etc.) and return read-only stream statuses ("Active", "Missing Key", "Disabled").
- **Frontend:**
  - Created `SystemHealthWidget.tsx` using the 'Sovereign Glass' design system.
  - Added a `HeartPulse` toggle button to `TopBar.tsx`.
  - Wired the `isSystemHealthOpen` state into `App.tsx` and passed it down to the `TopBar`.

## Verification
- Backend tests passed.
- Frontend local dev server running without errors.
- Visual verification confirmed via Playwright script capturing the active widget UI.
