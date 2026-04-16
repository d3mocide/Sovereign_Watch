## Issue

The `.env.example` entry for `AISHUB_USERNAME` was left blank, which made it less clear than other example environment variables whether users should supply a value or intentionally leave it empty.

## Solution

Updated the example value to use an explicit placeholder while keeping the surrounding comment that explains the variable is optional.

## Changes

- Updated `.env.example` so `AISHUB_USERNAME` now uses `your_aishub_username_here` as an example value.
- Left the existing guidance intact that users can blank the field to disable the AISHub fallback source.

## Verification

- Reviewed the maritime poller configuration usage and existing docs to confirm `AISHUB_USERNAME` is optional and the placeholder is consistent with repository conventions.
- No code test suite was required because this change only updates example configuration/documentation.

## Benefits

- Makes the example environment file clearer for first-time setup.
- Reduces ambiguity around whether the field expects a user-supplied value.