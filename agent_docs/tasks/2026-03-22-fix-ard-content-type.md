# 2026-03-22-fix-ard-content-type

## Issue

The RF Pulse poller's ARD (Amateur Repeater Directory) source fails to fetch the master repeater list from GitHub because `aiohttp` expects `application/json` but GitHub returns `text/plain; charset=utf-8`. This results in a `ContentTypeError`.

## Solution

Modified the `resp.json()` call in `backend/ingestion/rf_pulse/sources/ard.py` to use `content_type=None`, allowing it to decode the JSON response regardless of the `Content-Type` header returned by GitHub.

## Changes

- `backend/ingestion/rf_pulse/sources/ard.py`: Added `content_type=None` to `resp.json()`.

## Verification

- Run `ruff check` on the modified file.
- The service will require a rebuild to apply changes in the container: `docker compose up -d --build sovereign-rf-pulse`.

## Benefits

Ensures reliable ingestion of amateur radio repeater data from the ARD master list.
