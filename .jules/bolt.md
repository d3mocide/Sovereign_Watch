## 2024-05-13 - Avoid unnecessary string formatting in loop
**Learning:** Found a performance bottleneck in `backend/api/routers/orbital.py`. The SGP4 orbital pass predictor steps through time at 10-second intervals for every satellite to find passes above `min_elevation`. For each step, whether the satellite was visible or not, the code formatted the timestamp using `t.strftime("%Y-%m-%dT%H:%M:%SZ")` and rounded `az`, `el`, and `rng`. This point creation is expensive and happens 8640 times per satellite per day.
**Action:** Moving the creation of the `point` dictionary inside the `if el >= min_elevation:` block so it only occurs when the satellite is actually visible avoids unnecessary string allocations and math operations.

## 2024-05-15 - Defer Expensive Operations in High-Frequency Loops
**Learning:** In high-frequency orbital prediction loops (like `backend/api/routers/orbital.py`), calling `strftime` and allocating dictionaries for every sampled orbital point—even when the satellite is not visible—creates a massive performance bottleneck due to unnecessary string formatting and memory allocation overhead.
**Action:** Always defer expensive operations like `strftime` and object allocation until *after* filtering conditions (e.g., `el >= min_elevation`) have been met.

## 2024-05-25 - Avoid `datetime` loop logic and recalculating Julian dates in SGP4 pass prediction
**Learning:** In high-frequency orbital prediction loops, `datetime` loop logic (i.e. `t = now`, `t += timedelta(...)`) and recalculating Julian dates using `jday_from_datetime(t)` every step introduces significant allocation and CPU overhead.
**Action:** When stepping uniformly through time for SGP4, compute the initial Julian date (`jd_start, fr_start`) once before the loop. Use a standard integer `for` loop `for i in range(num_steps + 1):` and calculate the step in fractional days `fr = fr_start + i * step_days` mathematically. Defer `datetime` instantiation to when it's strictly needed for payload formatting.

## 2025-03-05 - Mathematical pass duration calculation
**Learning:** In performance-critical paths like orbital pass prediction where data points are collected at fixed intervals (`step_seconds`), calculating total duration via native arithmetic (`(len(points) - 1) * step_seconds`) is faster and cleaner than storing formatted strings and subsequently re-parsing them using `datetime.strptime`. While this specific code block executes only at the end of a pass (a few times per satellite), the concept eliminates costly object creation and parsing overhead.
**Action:** When working with structured telemetry or simulation outputs, utilize implicit array metadata (like point counts or loop indices combined with step intervals) for duration calculations instead of relying on explicit string-based timestamps.
