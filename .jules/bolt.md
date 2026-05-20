## 2024-05-13 - Avoid unnecessary string formatting in loop
**Learning:** Found a performance bottleneck in `backend/api/routers/orbital.py`. The SGP4 orbital pass predictor steps through time at 10-second intervals for every satellite to find passes above `min_elevation`. For each step, whether the satellite was visible or not, the code formatted the timestamp using `t.strftime("%Y-%m-%dT%H:%M:%SZ")` and rounded `az`, `el`, and `rng`. This point creation is expensive and happens 8640 times per satellite per day.
**Action:** Moving the creation of the `point` dictionary inside the `if el >= min_elevation:` block so it only occurs when the satellite is actually visible avoids unnecessary string allocations and math operations.

## 2024-05-15 - Defer Expensive Operations in High-Frequency Loops
**Learning:** In high-frequency orbital prediction loops (like `backend/api/routers/orbital.py`), calling `strftime` and allocating dictionaries for every sampled orbital point—even when the satellite is not visible—creates a massive performance bottleneck due to unnecessary string formatting and memory allocation overhead.
**Action:** Always defer expensive operations like `strftime` and object allocation until *after* filtering conditions (e.g., `el >= min_elevation`) have been met.

## 2025-02-14 - SGP4 Loop Optimization
**Learning:** In the orbital tracking API (`backend/api/routers/orbital.py`), allocating `datetime` objects and recalculating Julian dates within the SGP4 propagation `while` loop (which steps every 10 seconds for hours) creates significant overhead. Because Julian dates are linear fractions of days, they can be accurately calculated via step multiples instead of full `datetime` reconstruction.
**Action:** Replace high-frequency `datetime` `while` loops with step-based `for` loops precomputing the starting Julian date and fraction, saving `datetime.strftime` until only the filtering condition (`el >= min_elevation`) is met.
