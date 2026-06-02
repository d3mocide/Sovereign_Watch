## 2024-05-13 - Avoid unnecessary string formatting in loop
**Learning:** Found a performance bottleneck in `backend/api/routers/orbital.py`. The SGP4 orbital pass predictor steps through time at 10-second intervals for every satellite to find passes above `min_elevation`. For each step, whether the satellite was visible or not, the code formatted the timestamp using `t.strftime("%Y-%m-%dT%H:%M:%SZ")` and rounded `az`, `el`, and `rng`. This point creation is expensive and happens 8640 times per satellite per day.
**Action:** Moving the creation of the `point` dictionary inside the `if el >= min_elevation:` block so it only occurs when the satellite is actually visible avoids unnecessary string allocations and math operations.

## 2024-05-15 - Defer Expensive Operations in High-Frequency Loops
**Learning:** In high-frequency orbital prediction loops (like `backend/api/routers/orbital.py`), calling `strftime` and allocating dictionaries for every sampled orbital point—even when the satellite is not visible—creates a massive performance bottleneck due to unnecessary string formatting and memory allocation overhead.
**Action:** Always defer expensive operations like `strftime` and object allocation until *after* filtering conditions (e.g., `el >= min_elevation`) have been met.

## 2024-05-25 - Avoid `datetime` loop logic and recalculating Julian dates in SGP4 pass prediction
**Learning:** In high-frequency orbital prediction loops, `datetime` loop logic (i.e. `t = now`, `t += timedelta(...)`) and recalculating Julian dates using `jday_from_datetime(t)` every step introduces significant allocation and CPU overhead.
**Action:** When stepping uniformly through time for SGP4, compute the initial Julian date (`jd_start, fr_start`) once before the loop. Use a standard integer `for` loop `for i in range(num_steps + 1):` and calculate the step in fractional days `fr = fr_start + i * step_days` mathematically. Defer `datetime` instantiation to when it's strictly needed for payload formatting.

## 2024-05-27 - Remove testing artifacts before submit
**Learning:** Adding multiple temporary scratchpad files (e.g. `test_opt.py`, `test_perf.py`) to the repository root and forgetting to remove them causes PRs to be flagged for codebase pollution.
**Action:** Always clean up the working directory (`rm`) of any temporary files or one-off tests before finalizing a branch.

## 2025-02-21 - Vectorize NumPy operations by collecting inputs before loop
**Learning:** In high-frequency loops, applying a vectorized function to individual reshaped elements (e.g., `ecef_to_lla_vectorized(np.array(r_ecef).reshape(1, 3))`) loses all vectorization benefits and incurs heavy allocation overhead. Grouping the data into an array beforehand provides a massive performance boost (e.g., a ~5x speedup in `backend/api/routers/orbital.py`).
**Action:** When working with vectorized functions (like in NumPy), always collect individual outputs into a list, convert them into a single batched `(N, M)` array, and call the vectorized function once. Do not loop over individual calls to the vectorized function.

## 2026-05-30 - Python datetime parsing performance
**Learning:** Replacing `datetime.strptime(date, "%Y-%m-%d")` with `datetime.fromisoformat(date)` is a ~40x speedup micro-optimization. However, it requires the ISO 8601 extended format with hyphens (e.g. "YYYY-MM-DD") in older Python versions (< 3.11). Trying to use it on the basic format ("YYYYMMDD") without hyphens will raise a ValueError and introduce critical regressions.
**Action:** Always strictly verify the format of date strings. Only use `datetime.fromisoformat` for the extended format with hyphens ("YYYY-MM-DD") unless ensuring Python 3.11+ is used. Avoid `fromisoformat` for basic formats to prevent code review rejections and backward compatibility regressions.
