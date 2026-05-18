
## 2024-05-15 - Defer Expensive Operations in High-Frequency Loops
**Learning:** In high-frequency orbital prediction loops (like `backend/api/routers/orbital.py`), calling `strftime` and allocating dictionaries for every sampled orbital point—even when the satellite is not visible—creates a massive performance bottleneck due to unnecessary string formatting and memory allocation overhead.
**Action:** Always defer expensive operations like `strftime` and object allocation until *after* filtering conditions (e.g., `el >= min_elevation`) have been met.
