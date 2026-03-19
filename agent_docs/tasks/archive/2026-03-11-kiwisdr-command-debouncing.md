# KiwiSDR Command Debouncing Implementation

## Issue
Rapid interaction with the Radio Terminal UI (especially frequency tuning buttons and RF Gain/Squelch sliders) was causing the remote KiwiSDR connection to break or trigger rate limiting. This happened because every incremental UI change resulted in an immediate `SET` command being sent over the WebSocket to the KiwiSDR, which some nodes could not handle at high frequencies.

## Solution
Implemented a backend-side debouncing mechanism in the `KiwiClient` class. Commands that are frequently triggered by UI sliders or rapid clicks (`tune`, `set_agc`, `set_squelch`) are now delayed by 500ms. If a new command of the same type is received before the delay expires, the previous pending command is cancelled and the timer resets. This ensures that only the final intended state is sent to the KiwiSDR hardware.

## Changes
### `js8call/kiwi_client.py`
- Added `_command_tasks` dictionary to track pending debounced commands.
- Implemented `_debounce_command()` helper to manage task cancellation and execution timing.
- Updated `tune()`, `set_agc()`, and `set_squelch()` to use the debouncing helper.
- Updated `disconnect()` to ensure all pending debounced tasks are cancelled.

### `js8call/tests/test_kiwi_debounce.py` [New]
- Added an isolated async unit test to verify the debouncing logic using mocked WebSockets.

## Verification
- **Automated Tests**: Ran `test_kiwi_debounce.py` inside the `sovereign-js8call` container. All 3 tests (tune, agc, squelch) passed, confirming that multiple rapid calls only result in a single WebSocket `send` after the 500ms delay.
- **Manual Verification**: Rebuilt and restarted the `sovereign-js8call` container. The system is now resilient to rapid UI interactions.

## Benefits
- Improved connection stability when interacting with remote KiwiSDR nodes.
- Significantly reduced risk of IP rate limiting by SDR hosts.
- Smoother user experience as the backend now "waits" for the user to finish adjusting a slider before committing the change to hardware.
