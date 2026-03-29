# Release - v0.57.0 - OSINT Reader and Intel Workflow Refinement

This release upgrades the Intel and Tactical OSINT workflow from external-link handoff to an in-app reader flow, while also tightening the News widget layout and HUD alignment. The result is a more coherent operator experience for article triage, GDELT source review, and sidebar/map composition.

### Key Features

- **In-App Reader Mode**: Added a backend-powered article reader that fetches and extracts readable content from source URLs through `/api/news/article`.
- **News Widget Reader Integration**: News widget stories now open inside the app in Intel view, with a retained external-open control when operators want the original site.
- **GDELT Reader Integration**: `VIEW_SOURCE` in GDELT detail panels now opens in the same in-app reader flow.
- **Tactical + Intel Parity**: Extended the article viewer workflow to Tactical view so GDELT article review behaves consistently across both maps.

### UI/UX Improvements

- **Aggregate News Feed**: Full News widget is now a single-column, time-sorted aggregate stream with tactical metadata rows.
- **Intel Visual Alignment**: News widget header now matches Intel sidebar header conventions and the source label styling has been slimmed down.
- **Reduced Visual Noise**: Live Threats now starts collapsed by default and no longer shows the misleading count badge.
- **Balanced Intel Layout**: News widget height is capped at `75vh`, it hides while SITREP is active, Intel map nav is raised by 10px, and the article viewer aligns with the shared sidebar top baseline.

### Technical Details

- **Backend/API**:
  - Added `/api/news/article` for HTML fetch + readable text extraction.
  - Added basic HTML cleaning, title extraction, and content-length caps for reader-mode responses.
- **Frontend**:
  - Added shared article viewer state and overlay rendering in `App.tsx`.
  - Added `onOpenArticle` handling in `NewsWidget`.
  - Added `onOpenSource` callback plumbing through `SidebarRight` and `GdeltView`.
  - Added per-view positioning override support to shared `MapControls`.

### Verification

- Frontend: `cd frontend && pnpm run lint && pnpm run test` (pass, 36 tests)
- Backend API: `cd backend/api && python -m ruff check . && python -m pytest` (pass, 46 tests)

### Upgrade Instructions

To upgrade to v0.57.0:

1. Pull the latest code:
   `git pull origin main`
2. Rebuild and restart services:
   `docker compose up -d --build`
3. Validate OSINT workflows:
   - Open a News widget story in Intel view and confirm reader-mode content loads.
   - Open GDELT `VIEW_SOURCE` in both Intel and Tactical views and confirm the in-app reader opens.
   - Verify the Intel News widget layout and article viewer alignment match the HUD grid.
