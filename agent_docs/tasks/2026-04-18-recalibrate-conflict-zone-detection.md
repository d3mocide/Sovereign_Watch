# Recalibrate Active Conflict Zone Detection

## Issue

The ACTIVE CONFLICT ZONES panel consistently showed `[0]` even with ISR, RUS, IND, and UKR all active and carrying amber threat indicators. Three root causes:

1. **CRITICAL threshold too conservative** — the old gate (`threat_score ≤ -6.0`) required both a severely negative Goldstein average *and* a high material-conflict ratio. Real-world active warzones (Ukraine, Gaza) typically cluster in the −3 to −5 Goldstein band under GDELT and would never trigger it.
2. **No kinetic-volume bypass** — a country with 200 material conflict events over a quiet news cycle could still be classified as MONITORING if its average Goldstein was diluted by non-conflict articles.
3. **Conflict zone panel excluded MONITORING actors** — the frontend filter only showed CRITICAL and ELEVATED actors, meaning even correctly-classified MONITORING conflict zones were invisible in that panel.

## Solution

Three coordinated changes:

1. **Recalibrated Goldstein thresholds** to match observed GDELT distributions:
   - CRITICAL: `threat_score ≤ -4.5` (was `-6.0`)
   - ELEVATED: `threat_score ≤ -2.0` (was `-3.0`)

2. **Added material-conflict volume shortcut** — bypasses the Goldstein average when a country shows high absolute kinetic event counts:
   - `material_conflict > 150` → CRITICAL (regardless of Goldstein)
   - `material_conflict > 50` and was MONITORING → promote to ELEVATED

3. **Conflict zone panel now includes MONITORING** — shows all three negative threat levels (CRITICAL →red, ELEVATED →amber, MONITORING →yellow/WATCH badge). The zone counter now breaks out counts by level (`[2]+3+7`) instead of a single total.

## Changes

| File | Change |
|------|--------|
| `backend/api/routers/gdelt.py` | Lowered CRITICAL/ELEVATED thresholds; added material-conflict shortcut |
| `frontend/src/components/layouts/IntelSidebar.tsx` | `conflictZones` filter includes MONITORING; header count is split by level; zone badge uses `conflictZoneBadgeLabel()` returning CRITICAL/ELEVATED/WATCH |
| `frontend/src/components/widgets/ActiveConflictWidget.tsx` | Same filter expansion and WATCH badge; count display shows active/watch split |
| `backend/api/tests/test_gdelt_router.py` | 6 new threshold/shortcut regression tests |

## Verification

- `cd backend/api && uv tool run ruff check .` — clean.
- `cd backend/api && uv run python -m pytest tests/test_gdelt_router.py -v` — **11/11 passed**.
- `cd frontend && pnpm run lint` — exit 0.
- `cd frontend && pnpm run typecheck` — exit 0.

## Benefits

- ISR, UKR, RUS, and other active conflict zones will now correctly surface in the ACTIVE CONFLICT ZONES panel.
- High-kinetic actors (Gaza, Sudan) are promoted even during subdued media cycles.
- MONITORING actors are visible without polluting the CRITICAL/ELEVATED severity hierarchy — operators can see the full threat picture in one panel.
