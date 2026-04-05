# Space Weather NOAA Scales Fix

- **Issue**: NOAA SWPC changed the `noaa-scales.json` payload format, removing prefixes from the `Scale` field (e.g., changing `"R3"` to `"3"`). This broke the `_parse_scale_int` function which assumed >2 character strings, causing the active R/S/G alert logic to evaluate ALL levels to 0. Consequently, signal-loss suppressions and dashboard active storm notifications never triggered.
- **Solution**: Patched the parsing and variable extraction logic in `space_weather.py` to be resilient to both formats.
- **Changes**: 
  - `backend/ingestion/space_pulse/sources/space_weather.py`:
    - Updated `_parse_scale_int` to attempt a direct integer conversion for bare numeral cases.
    - Updated the `_poll_noaa_scales` method to conditionally inject 'R', 'G', and 'S' prefixes back into the scale string logs when needed, ensuring UI messages read as `R3 Radio Blackout` rather than `3 Radio Blackout`.
- **Verification**: Verified using `docker compose up -d --build sovereign-space-pulse` to rebuild and roll the container over seamlessly. Log and format changes manually validated.
- **Benefits**: Fixes silent space weather signal loss suppression failures. Restores proper intelligence/anomaly correlation.
