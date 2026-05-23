## 2024-05-13 - Avoid unnecessary string formatting in loop
**Learning:** Found a performance bottleneck in `backend/api/routers/orbital.py`. The SGP4 orbital pass predictor steps through time at 10-second intervals for every satellite to find passes above `min_elevation`. For each step, whether the satellite was visible or not, the code formatted the timestamp using `t.strftime("%Y-%m-%dT%H:%M:%SZ")` and rounded `az`, `el`, and `rng`. This point creation is expensive and happens 8640 times per satellite per day.
**Action:** Moving the creation of the `point` dictionary inside the `if el >= min_elevation:` block so it only occurs when the satellite is actually visible avoids unnecessary string allocations and math operations.

## 2024-05-15 - Defer Expensive Operations in High-Frequency Loops
**Learning:** In high-frequency orbital prediction loops (like `backend/api/routers/orbital.py`), calling `strftime` and allocating dictionaries for every sampled orbital point—even when the satellite is not visible—creates a massive performance bottleneck due to unnecessary string formatting and memory allocation overhead.
**Action:** Always defer expensive operations like `strftime` and object allocation until *after* filtering conditions (e.g., `el >= min_elevation`) have been met.
## 2024-05-23 - Optimize high-frequency Julian date calculations
**Learning:** Calling `datetime` object property accessors and external Julian date converters iteratively in high-frequency loops (like SGP4 orbit propagation) creates significant overhead. In loops stepping by fixed time intervals, the Julian fractional date advances linearly.
**Action:** Pre-compute the starting Julian date and fraction before the loop. Use floating-point math (`start_fr + i * step_days`) to calculate the date for each iteration instead of instantiating and decomposing `datetime` objects. Construct `datetime` objects lazily only when needed for string formatting output.
