# Release - v0.39.1 - RadioReference Poller Fix

This patch release addresses a critical startup crash in the `rf_pulse` infrastructure poller that occurred when RadioReference credentials were provided.

## Key Features
- **Poller Stability**: The `rf_pulse` microservice now correctly connects to the v9 RadioReference SOAP API and successfully handles User-Agent requirements over CloudFront.

## Technical Details
- Injected `User-Agent` headers deep into the `zeep` WSDL fetcher to bypass 403 Forbidden errors.
- Updated `radioref.py` to use modern credential-passing standards instead of the deprecated `getAuthToken` handshake.
- Stubbed out unsupported trunked system queries to prevent the service from crashing on load.

## Upgrade Instructions
```bash
git pull origin dev
docker compose build rf-pulse
docker compose up -d
```
