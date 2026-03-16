# Release - v0.32.2 - Deployment Stability

## Summary
Version 0.32.2 is a targeted stability patch that fully eliminates the "localhost friction" discovered during v0.32.1 network testing. It adds deep intelligent fallback logic to the remaining frontend modules, ensuring robust out-of-the-box connectivity even when deployment environments differ from build-time configurations.

## Key Fixes
- **Deep Localhost Removal**: Fixed remaining hardcoded `localhost` references in `useEntityWorker.ts` (Main Tracks), `useKiwiNodes.ts` (Radio Directory), and `ListeningPost.tsx` (High-Speed Waterfall).
- **Zero-Config Network Mobility**: The frontend now dynamically derives the host server's IP for ALL services as a primary fallback, allowing users to deploy and access the platform from any network node without touching `.env` variables if defaults are used.

## Technical Details
- Implemented robust `getWsUrl` and `getNODES_URL` helpers in the respective hooks.
- Standardized origin derivation across all WebSocket and REST API endpoints.

## Upgrade Instructions
1. Pull the latest changes.
2. Rebuild and restart:
```bash
docker compose up -d --build
```
