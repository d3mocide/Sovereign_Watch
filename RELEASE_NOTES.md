# Release - v0.39.0 - Watchlist & Tactical UI Updates

This release officially deploys the highly anticipated Global Watchlist feature. Operators can now specify ICAO24 hex codes to track permanent or temporary air contacts globally, aggressively bypassing localized spatial filters. This enables seamless over-the-horizon tracking of critical assets without requiring direct bounding-box oversight. Additionally, multiple focused tactical UI adjustments address the placement, consistency, and contextual rendering of sidebar tools and action buttons.

## Key Features
- **Global Watchlist UI**: Easily add, monitor, and remove watched ICAO24s directly via the newly added management panel inside the `SystemSettingsWidget`.
- **Global Watchlist API**: Three distinct new endpoints (`GET/POST/DELETE`) provide robust interaction with the Redis ZSET storage back-end, allowing operators to mark tracks as either persistent (01-Jan-3000) or TTL-expiring.
- **Dynamic Track Filtering Bypass**: Selected targets on the watchlist are elevated to bypass AOR spatial filters natively within the `useEntityWorker` event loop, guaranteeing active painting on the map.
- **UI & Interaction Hygiene**:
  - Restructured the Right Sidebar to prioritize the Track Log placement for aircraft identities.
  - Blocked arbitrary rendering of the "Track Log" button for non-relevant entries (such as maritime/AIS).
  - Fixed Compass map generation and Action buttons (CENTER/TRACK) to adopt true dynamic `accentColor` schemes depending on the entity loaded into the inspector.

## Technical Details
- Added `watchlist.ts` supporting the asynchronous poll-and-sync 30-second loop.
- Ensured ICAO24 6-character validations actively protect Redis insertions.
- `Compass.tsx` now utilizes explicit inline HTML styles alongside Hexadecimal alpha variables (`${hexColor}66`) to evade rigid Tailwind CSS purging mechanisms.

## Upgrade Instructions
```bash
git pull origin main
docker compose build frontend backend-api
docker compose up -d
```
