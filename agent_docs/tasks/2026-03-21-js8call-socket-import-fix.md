# JS8Call Bridge Socket Import Fix

## Issue
The JS8Call container logs (js8bridge) were throwing multiple errors: `UDP send failed: name 'socket' is not defined`. This failure occurs when the bridge attempts to send a UDP datagram via `_udp_send()` but the Python `socket` module was missing from the imports. 

## Solution
Added `import socket` to the imports section at the top of `js8call/server.py`. 

## Changes
- Modified `js8call/server.py` to include `import socket` near the top of the file, alongside other standard library imports.

## Verification
- Applied the fix to `js8call/server.py`.
- Need to ensure tests/lints are run, specifically `ruff check .` inside the js8call directory (if applicable).

## Benefits
- Prevents runtime errors preventing JS8Call bridging via UDP.
- Ensures the UDP communication layer functions correctly without silent failures recorded in the logs.
