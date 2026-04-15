# Pre-Release Gate - Patch Candidate

## Status
This patch candidate packages a large verified set of backend ingestion fixes, FIRMS scope and cache corrections, frontend map interaction repairs, and release-hygiene updates. The branch is not ready for a GO decision yet because two live-map regressions remain open at the release gate.

## Verified Scope
- **FIRMS Scope and Cache Corrections**: Mission-mode FIRMS and dark-vessel requests now resolve the active mission area explicitly, while global FIRMS requests use a dedicated live world-feed cache/fallback path instead of reusing the mission cache.
- **Dark-Vessel Backend Land Masking**: The backend FIRMS router now excludes land-intersecting hotspots before dark-vessel matching and loads the world land-mask asset safely in the backend container.
- **Space-Pulse Cadence Recovery**: Orbital startup now primes from cached TLEs when available, FIRMS and space-weather cadence is persisted in Redis, and daily TLE refresh behavior is aligned with the configured UTC fetch hour.
- **SatNOGS and Infra Recovery**: SatNOGS pagination loops now advance correctly with backoff, PeeringDB IXPs recover coordinates from facility centroids, and outage ingestion regained its Nominatim geocoder.
- **Map UX Repairs**: FIRMS control layout, outage selection routing, and ISS layer rendering code paths were all updated and verified at the code/test level.

## Verification Summary
- `docker compose exec sovereign-backend sh -lc "uv tool run ruff check . && uv run python -m pytest"`
	- Result: passed (`145` backend API tests).
- Prior targeted verification recorded in task logs:
	- Frontend lint, typecheck, and test suites passed for the ISS/FIRMS interaction changes.
	- `space_pulse` lint and container pytest passed for cadence and scheduler fixes.
	- Targeted infra poller verification passed for the outage geocoder and IXP recovery changes.

## Hold Items
- **ISS Rendering**: The ISS map render path has been reworked, but live behavior is still reported as broken. This needs runtime validation in the actual UI before the patch can be promoted.
- **FIRMS Dark Vessels**: Frontend mission scoping and backend land masking are in place, but live dark-vessel behavior is still reported as broken. This also needs runtime validation before release.

## Recommendation
Keep the candidate at **HOLD**. The verified fixes are strong enough to preserve as the patch set for the next release, but the release gate should stay closed until the live ISS and FIRMS dark-vessel regressions are resolved or explicitly deferred.

**SITREP Status: [HOLD]**
**Known blockers remain: ISS Rendering, FIRMS Dark Vessels.**
