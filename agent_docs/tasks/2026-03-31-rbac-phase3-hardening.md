# Task: 2026-03-31-rbac-phase3-hardening

## Issue
High-resource AI analysis triggering and sensitive radio hardware controls were accessible to all users, including those with the `viewer` role. This posed a risk of unauthorized API costs and unauthorized radio transmissions.

## Solution
Implemented a comprehensive Role-Based Access Control (RBAC) hardening pass across the backend and frontend. Restricted AI model switching to `admin`, and AI analysis triggering, radio transmission, and station configuration to `operator`.

## Changes

### Backend (FastAPI)
- [MODIFY] [system.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/api/routers/system.py): Restricted `POST /api/config/ai` to `require_role("admin")`.
- [MODIFY] [analysis.py](file:///home/zbrain/Projects/Sovereign_Watch/backend/api/routers/analysis.py): Restricted `POST /api/analyze/{uid}` to `require_role("operator")`.

### Frontend (React)
- [MODIFY] [AIAnalystPanel.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/widgets/AIAnalystPanel.tsx):
    - Gated "Run" button with `isOperator` check.
    - Gated AI Engine Settings gear with `isAdmin` check.
    - Added `Lock` icons and "Locked" tooltips for unauthorized users.
- [MODIFY] [JS8Widget.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/widgets/JS8Widget.tsx):
    - Gated transmission (TX) input and button with `isOperator`.
    - Gated station identity (callsign/grid) editing with `isOperator`.
    - Gated SDR node connection/disconnection with `isOperator`.
    - Integrated `Lock` icons for unauthorized users.
- [MODIFY] [ListeningPost.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/js8call/ListeningPost.tsx):
    - Gated tuning, modulation, and band selection with `isOperator`.
    - Gated AGC, Squelch, DSP, and server-side Waterfall settings with `isOperator`.
    - Integrated `Lock` icons and role-based feedback.
- [MODIFY] [IntelSidebar.tsx](file:///home/zbrain/Projects/Sovereign_Watch/frontend/src/components/layouts/IntelSidebar.tsx):
    - Gated "Generate AI Sitrep" button with `isOperator`.

## Verification
- Verified backend RBAC injection logic via `require_role` dependency.
- Manually verified frontend component logic against the tactical UI state.
- Cleaned up unused `Shield` icon imports to resolve lint warnings.

## Benefits
- **Security**: Prevents unauthorized hardware/radio actions.
- **Cost Control**: Restricts expensive LLM API calls to vetted operators and admins.
- **UX**: Provides clear visual "Locked" feedback to users instead of silent failures.
