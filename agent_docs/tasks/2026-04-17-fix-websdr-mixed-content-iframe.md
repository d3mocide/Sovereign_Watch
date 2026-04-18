# Fix WebSDR Mixed Content Iframe

## Issue

When the app was served over HTTPS, the WebSDR panel still used receiver directory URLs directly as iframe sources. Many discovered nodes advertise `http://` endpoints, which caused the browser to block the embedded receiver as mixed content.

## Solution

Separated the WebSDR launch URL from the embeddable iframe URL. On HTTPS pages, iframe URLs are upgraded to `https://` when the directory only provides `http://`, while the original URL is preserved for the fallback `Open in new tab` action.

## Changes

- Updated `frontend/src/components/js8call/WebSDRPanel.tsx` to build an embed-safe iframe URL and keep the original launch URL for direct navigation.
- Added a small operator-facing footer/fallback note when embedded mode is being HTTPS-upgraded.
- Added regression coverage in `frontend/src/components/js8call/WebSDRPanel.test.ts`.

## Verification

- `cd frontend && pnpm run lint` passed.
- `cd frontend && pnpm run typecheck` passed.
- `cd frontend && pnpm run test` passed.

## Benefits

- HTTPS deployments no longer emit mixed-content iframe requests for WebSDR receivers.
- Receivers that support HTTPS continue to embed in-app.
- Receivers that only work over HTTP still have a viable operator fallback through `Open in new tab`.