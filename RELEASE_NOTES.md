# Release - v0.39.2 - Spectral Precision

## Summary
This update significantly enhances the **RadioReference** ingestion engine, moving from system-level centroids to individual tower sites and conventional regional frequencies. This shift provide operators with much higher spatial accuracy and detailed technical intelligence for public safety and regional radio infrastructure.

## Key Features
- **Tower-Level Accuracy**: Instead of showing one dot per radio system, we now map every physical site (tower) individually.
- **Frequency Intelligence**: Direct display of input/output frequencies, CTCSS tones, and advanced digital modes (P25, DMR, NXDN) in the UI.
- **Regional Coverage**: Added deep traversal of State -> County subcategories to fetch regional conventional frequencies.
- **API Protection**: Persistent Redis-backed cooldown mechanism to prevent unnecessary API consumption during development or container restarts.

## Technical Details
- **Sync Strategy**: Fetch interval now defaults to **168 hours (7 days)**, configurable via `RF_RADIOREF_INTERVAL_H`.
- **Cache Management**: LocalStorage cache version bumped to `v4`.

## Upgrade Instructions
Run the following commands to pull the latest changes and apply the poller updates:

```bash
git pull origin dev
docker compose up -d --build rf-pulse
```
