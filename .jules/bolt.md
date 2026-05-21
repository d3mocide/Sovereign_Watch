## 2024-05-13 - Avoid unnecessary string formatting in loop
**Learning:** Found a performance bottleneck in `backend/api/routers/orbital.py`. The SGP4 orbital pass predictor steps through time at 10-second intervals for every satellite to find passes above `min_elevation`. For each step, whether the satellite was visible or not, the code formatted the timestamp using `t.strftime("%Y-%m-%dT%H:%M:%SZ")` and rounded `az`, `el`, and `rng`. This point creation is expensive and happens 8640 times per satellite per day.
**Action:** Moving the creation of the `point` dictionary inside the `if el >= min_elevation:` block so it only occurs when the satellite is actually visible avoids unnecessary string allocations and math operations.

## 2024-05-15 - Defer Expensive Operations in High-Frequency Loops
**Learning:** In high-frequency orbital prediction loops (like `backend/api/routers/orbital.py`), calling `strftime` and allocating dictionaries for every sampled orbital point—even when the satellite is not visible—creates a massive performance bottleneck due to unnecessary string formatting and memory allocation overhead.
**Action:** Always defer expensive operations like `strftime` and object allocation until *after* filtering conditions (e.g., `el >= min_elevation`) have been met.

## 2024-05-21 - Avoid datetime allocation and step iteration in high-frequency SGP4 loop
**Learning:** In the `backend/api/routers/orbital.py` orbital pass prediction loops, iterating through time by creating a new `datetime` object on every step and running `jday` calculation over it caused extreme overhead (~2.5x slower). This loops over 8640 times per satellite per 24 hours.
**Action:** Always precompute the starting Julian date (`jd`, `fr`) outside high-frequency time-stepping loops. Iterate using a `for` loop, adjusting the fractional day mathematically (`fr = start_fr + i * step_days`). This avoids allocating `datetime` objects and Julian date mathematical conversions on every tick.
