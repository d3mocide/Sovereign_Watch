Issue: The OpenSky watchlist loop was hitting repeated 429 responses about every 30 seconds because cooldown escalation only doubled while the client was still inside the existing cooldown window.

Solution: Track consecutive OpenSky penalties until a real successful response resets the state, so repeated 429s escalate to longer cooldowns even when each retry happens after the previous cooldown expires.

Changes:
- Updated backend/ingestion/aviation_poller/opensky_client.py to keep consecutive penalty state across retries and reset it only after a successful response.
- Added a regression test in backend/ingestion/aviation_poller/tests/test_opensky_client.py for the exact retry-after-cooldown pattern observed in container logs.

Verification:
- Checked sovereign-adsb-poller container logs and confirmed OpenSky 429s were occurring roughly every 30.6 seconds with a constant 30 second cooldown.
- Ran backend/ingestion/aviation_poller host verification: ruff check . and python -m pytest.

Benefits:
- Reduces repeated hammering of the OpenSky API under sustained rate limiting.
- Lowers the risk of exhausting credits or tripping provider-side abuse protections during watchlist testing.