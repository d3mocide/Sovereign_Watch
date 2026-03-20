# 2026-03-20-radioref-poller-fix

## Issue
The user noticed an issue with the Radio Reference API implementation. The `rf_pulse` container entered a crash loop when `RADIOREF_APP_KEY`, `RADIOREF_USERNAME`, and `RADIOREF_PASSWORD` were provided. The errors indicated a `zeep.exceptions.TransportError` and `AttributeError: Service has no operation 'getAuthToken'` while trying to initialize the WSDL client and authenticate.

## Solution
Investigated the `radioref.py` source and Zeep's asynchronous WSDL fetching behavior. The `zeep.exceptions.TransportError` was caused by RadioReference's API (and CloudFront) blocking requests lacking a valid `User-Agent` header, preventing synchronous WSDL downloads by Zeep's `AsyncTransport`.

Furthermore, it was discovered that the `getAuthToken` operation and `getCountrySystemList` operation are no longer supported or present in the current RadioReference SOAP API v9 WSDL.

## Changes
- Modified `backend/ingestion/rf_pulse/sources/radioref.py` to inject `{"User-Agent": "SovereignWatch/1.0"}` headers into both the `AsyncClient` and `#wsdl_client` for `zeep`'s `AsyncTransport`.
- Updated `WSDL_URL` to append `&v=9` to fetch the correct, current WSDL version.
- Removed the unsupported `getAuthToken` call and the cached `self._auth_token`.
- Changed `_auth_info` to pass `password` and `version="latest"` directly, bypassing token exchange which is no longer needed.
- Stubbed out `_fetch_systems` to return an empty array `[]` and log a warning, since `getCountrySystemList` no longer exists. A complete refactor of trunked system ingestion is required to fetch details piecemeal, but this change gracefully prevents `rf-pulse` from crashing in the meantime.

## Verification
- Rebuilt the `rf-pulse` docker container.
- Verified in `docker compose logs rf-pulse` that the Service boots successfully, fetches the WSDL with HTTP 200 via `httpx`, logs the "unsupported method" warning gracefully, and proceeds to parse other incoming RF data without further exceptions.
- Due to the container being a `--no-dev` slim image, `pytest` was skipped inside the running container, but syntax and type checking passes.

## Benefits
- Restored stability and continuous uptime to the `rf_pulse` poller.
- The `RadioReference` credential config no longer crashes the service globally.
