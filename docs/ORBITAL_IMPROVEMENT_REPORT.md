# Orbital Tracking System — Improvement Report

**Based on:** `docs/celestrak-info.md` — CelesTrak GP Architecture Analysis
**Scope:** `backend/ingestion/orbital_pulse/main.py` and the broader orbital ingestion pipeline
**Date:** 2026-02-22

---

## Executive Summary

The current `sovereign-orbital-pulse` service has a working foundation: it fetches six satellite groups from CelesTrak in legacy TLE format, propagates positions with SGP4, and streams TAK events to Kafka. However, the CelesTrak architecture document exposes seven significant gaps between what the service currently does and what the API can provide. These gaps affect data fidelity, catalog coverage, API compliance, and system resilience. This report itemizes each gap, explains its impact, and provides a copy-pasteable agent prompt to implement each fix.

---

## Gap Analysis

### GAP-1 — Legacy TLE Format: Should Migrate to OMM/JSON

**Current behavior:** `fetch_tle_data` requests `FORMAT=TLE` for every group, returning the 168-byte legacy text format.

**Problem:** The CelesTrak doc explicitly states TLE is a legacy format with a hard 5-digit NORAD ID limit. The OMM JSON format (`FORMAT=JSON`) provides:
- Full 9-digit catalog numbers (no overflow)
- ISO 8601 epoch strings (no Y2K-style 2-digit year ambiguity)
- Epoch date as a parseable field for cache deduplication (see GAP-4)
- The `CLASSIFICATION` field to detect SupGP vs. standard GP (see GAP-5)

**Impact:** The current parser will silently produce wrong NORAD IDs or crash when it encounters Alpha-5 catalog numbers (e.g., `A0000`–`Z9999` for objects 100,000–339,999). Space Fence activation already pushed the analyst catalog into this range (270,000–339,999).

---

### GAP-2 — Alpha-5 Catalog Number Parsing Not Handled

**Current behavior:** `Satrec.twoline2rv(l1, l2)` is called on raw TLE lines. The `sat.satnum` field is read as an integer.

**Problem:** The Alpha-5 schema replaces the leading digit of catalog numbers ≥ 100,000 with a letter (A=10, B=11, … Z=36, skipping I and O). The `sgp4` Python library's `twoline2rv` may silently misparse or raise an exception on these strings. Any system code that later uses `norad_id` as a numeric DB key will generate incorrect foreign key associations.

**Impact:** Analyst objects (T0000–Z9999), newly-tracked Space Fence debris, and some Starlink/Kuiper entries when the catalog grows will either produce fatal parse errors or silently corrupt NORAD ID mappings in downstream databases.

**Alpha-5 Mapping Reference:**

| TLE String Prefix | True Catalog Prefix |
|---|---|
| A–H | 10–17 |
| J–N | 18–22 |
| P–Z | 23–36 |

---

### GAP-3 — Insufficient Group Coverage

**Current groups:** `gps-ops`, `glonass-ops`, `galileo`, `beidou`, `weather`, `noaa`

**Problem:** The CelesTrak taxonomy exposes dozens of additional groups that are relevant to a space situational awareness platform. The following are directly called out by the architecture doc as high-value:

| Missing Group | API Param | Why It Matters |
|---|---|---|
| Space Stations | `stations` | ISS / Tiangong — updated multiple times daily; critical for conjunction awareness |
| Active Satellites (full) | `active` | ~9k unclassified payloads; broad operational picture |
| Last 30 Days Launches | `last-30-days` | New deployments with rapidly evolving SupGP; important for new constellation tracking |
| Starlink | `starlink` | Thousands of maneuvering LEO objects; dense SupGP dependency |
| OneWeb | `oneweb` | Active LEO broadband constellation relying on SupGP |
| Kuiper | `kuiper` | Amazon megaconstellation, densely packed shells |
| COSMOS-1408 Debris | `cosmos-1408` | Russian ASAT debris cloud actively threatening LEO |
| Fengyun-1C Debris | `fengyun-1c` | 2007 Chinese ASAT debris cloud — long-lasting LEO threat |
| Iridium-33 Debris | `iridium-33-debris` | 2009 collision debris, monitored for constellation conjunctions |
| GEO Protected Zone | `SPECIAL=GPZ` | High-risk orbital real estate; used by SOCRATES conjunction analysis |
| Analyst Satellites | `analyst` | UCTs and uncorrelated tracks — anomalous objects without identified state |
| CubeSats | `cubesat` | High-drag nanosatellites; TLE age matters more here |

**Impact:** Without space stations, debris fields, and megaconstellations, the system has no picture of the high-risk objects that drive collision avoidance decisions.

---

### GAP-4 — No Epoch-Based Cache Deduplication

**Current behavior:** The cache validity check uses filesystem `mtime`. If the file is older than 2 hours, it re-fetches unconditionally and overwrites.

**Problem:** The CelesTrak doc explicitly states: *"If the epoch of the newly downloaded file matches the epoch of the locally stored data, the backend write operation should be aborted immediately."* Stable GEO satellites (Intelsat, GOES, GPS MEO) may retain the same epoch for 3–7 days. Re-fetching and overwriting with identical data wastes I/O and breaks downstream epoch-change detection logic.

**Impact:** Unnecessary DB writes, wasted network calls, and inability to signal downstream consumers that data has actually been refreshed vs. re-downloaded unchanged.

---

### GAP-5 — SupGP Classification Flag Not Parsed

**Current behavior:** The `meta` dict contains `name`, `norad_id`, `category`, `period_min`, and `inclination_deg`. No field tracks whether a TLE came from standard SSN data or CelesTrak SupGP.

**Problem:** Column 8 of TLE Line 1 contains `U` for standard SSN data and `C` for CelesTrak-generated SupGP. SupGP data is an order of magnitude more accurate (0.20 km average error vs. 3.30 km for standard). For Starlink/OneWeb/Kuiper, SupGP is the only way to get sub-kilometer tracking. The system currently treats all TLEs as equal quality.

**Post-maneuver flag:** When a satellite is executing a burn, CelesTrak appends `[PM]` to the name on Line 0. This flag should be parsed and forwarded to consumers so they can weight the TLE appropriately.

**Impact:** Downstream consumers cannot implement quality-weighted propagation. Objects undergoing active maneuvers cannot be flagged, leading to stale trajectory projections for maneuvering spacecraft.

---

### GAP-6 — No HTTP 429 / Rate-Limit Header Handling

**Current behavior:** The orbital poller returns `continue` on 403/404 but has no special handling for 429. The 2-hour cache is the only rate-limit guard. No HTTP response headers are parsed.

**Problem:** The CelesTrak doc states servers actively monitor request patterns and issue HTTP 429 responses or temporary IP blocks for abusive polling. The Space-Track API enforces hard limits (30 req/min, 300 req/hr). The response headers `X-RateLimit-Limit` and `X-RateLimit-Remaining` are described as the canonical signal for dynamic backoff.

**Impact:** A misconfigured or burst-fetching instance will receive 429 responses and eventually an IP ban, taking the entire orbital data feed offline. Unlike the aviation `MultiSourcePoller` (which has a mature exponential cooldown system), the orbital poller has no equivalent resilience.

---

### GAP-7 — Period Calculation Uses rad/min Formula; Should Use mean_motion (rev/day)

**Current behavior:**
```python
period_min = (2 * math.pi / sat.no_kozai) if sat.no_kozai > 0 else 0
```
`sat.no_kozai` is mean motion in radians/minute (the Kozai-style value). Dividing `2π` by radians/minute gives minutes per revolution — this is mathematically correct but uses an internal SGP4 intermediate value.

**Problem:** The CelesTrak doc specifies: `Period = 1440 / n` where `n` is mean motion in **revolutions per day** (the value in TLE Line 2, columns 53–63). When migrating to OMM JSON format, the `MEAN_MOTION` field is in rev/day. The two formulae should agree, but relying on `no_kozai` (an internal SGP4 intermediate) is fragile across library versions and doesn't translate cleanly to OMM fields.

**Impact:** Minor correctness risk today; breaks if the library changes internal attribute names or if OMM fields are used directly post-migration.

---

### GAP-8 — GMST Approximation: No Earth Orientation Parameters

**Current behavior:** The `teme_to_ecef_vectorized` method uses a simplified linear GMST formula:
```python
gmst = (18.697374558 + 24.06570982441908 * d) % 24.0
```

**Problem:** This is a low-precision approximation. The CelesTrak doc notes that SupGP generation uses *"the latest precision Earth Orientation Parameters (EOP) and dynamic space weather atmospheric data."* The `astropy` or `skyfield` libraries implement the full IAU 2006/2000A GMST with EOP corrections. For LEO objects, positional error from GMST approximation at the sub-kilometer level is non-trivial at high latitudes.

**Impact:** The system produces slightly incorrect lat/lon/alt for all satellites. For GNSS satellites used as positioning references, this degrades accuracy. For conjunction analysis, the error compounds.

---

## Recommended Fixes — Priority Order

| Priority | Gap | Complexity | Impact |
|---|---|---|---|
| P1 | GAP-6: 429 / rate-limit handling | Low | Prevents total feed loss |
| P1 | GAP-2: Alpha-5 parsing | Low | Prevents crash on new catalog numbers |
| P2 | GAP-5: SupGP C-flag + [PM] parsing | Low | Improves data quality metadata |
| P2 | GAP-4: Epoch-based cache dedup | Medium | Reduces wasteful writes |
| P2 | GAP-3: Expand group coverage | Medium | Broadens operational picture |
| P3 | GAP-1: Migrate to OMM JSON | Medium | Future-proofs catalog handling |
| P3 | GAP-7: Period calc from rev/day | Low | Correctness/clarity |
| P3 | GAP-8: EOP-corrected GMST | High | Sub-km positional accuracy |

---

## Agent Prompts

Each prompt below is self-contained. Paste it to an agent with access to the `backend/ingestion/orbital_pulse/` directory.

---

### PROMPT-1 — Add HTTP 429 Exponential Backoff to Orbital Poller

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py

Task:
The `fetch_tle_data` method inside `OrbitalPulseService` currently handles HTTP 403 and 404
but has no special handling for HTTP 429 (Too Many Requests) responses from CelesTrak.

1. Add a per-group exponential backoff mechanism modeled on the `AviationSource.penalize()`
   pattern in `backend/ingestion/poller/multi_source_poller.py`.
   - Maintain a dict `self._group_cooldowns: Dict[str, float]` keyed by group param_val.
   - When a 429 is received, set a cooldown starting at 300 seconds (5 min), doubling on
     each successive 429 for that group up to 3600 seconds (1 hour).
   - When iterating groups, skip any group currently in cooldown and log a warning.
   - On a successful 200 response, clear the cooldown for that group.

2. Parse the `X-RateLimit-Remaining` response header (if present). If its integer value
   is ≤ 2, add a 10-second sleep after the current request before proceeding to the next
   group, regardless of whether the cache was used.

3. Add a `_group_cooldown_step: Dict[str, float]` dict to track the current backoff step
   per group (starting at 300.0, doubling each hit, capping at 3600.0).

4. Log group cooldown entry and exit at WARNING and INFO level respectively.

Do NOT change any other logic. Add tests in `verify_classification.py` or a new
`test_orbital_pulse.py` file to verify the cooldown increment logic.
```

---

### PROMPT-2 — Implement Alpha-5 Catalog Number Parsing

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py

Background:
The CelesTrak NORAD catalog has exceeded 99,999 objects. For objects with catalog numbers
≥ 100,000 the TLE format uses "Alpha-5" encoding: the leading digit is replaced by a
letter where A=10, B=11, C=12 ... (skipping I and O) ... Z=36. For example:
- Catalog 100,000 → "A0000"
- Catalog 339,999 → "Z9999"

The Python `sgp4` library's `twoline2rv` may silently misparse these or set satnum to 0.

Task:
1. Add a module-level function `parse_alpha5_norad(raw: str) -> int` that:
   - If the first character is alphabetic, maps it to its numeric prefix using the
     Alpha-5 lookup (A→10, B→11, C→12, D→13, E→14, F→15, G→16, H→17, J→18, K→19,
     L→20, M→21, N→22, P→23, Q→24, R→25, S→26, T→27, U→28, V→29, W→30, X→31,
     Y→32, Z→33 — note I and O are skipped so the mapping is not sequential ASCII).
   - Concatenates the numeric prefix with the remaining 4 digits and returns the
     integer result.
   - If the first character is a digit, returns `int(raw.strip())` unchanged.

2. In the TLE parsing block inside `fetch_tle_data`, after calling
   `Satrec.twoline2rv(l1, l2)`, extract the raw catalog field from `l1[2:7]` and call
   `parse_alpha5_norad` to get the true integer catalog number. Assign this value to
   `norad_id` in `sat_dict` instead of relying on `sat.satnum`.

3. Ensure `norad_id` stored in `sat_meta` is always a Python `int`, not a string.

4. Add unit tests in `verify_classification.py` or a new file that verify the mapping
   for at least: "A0000" → 100000, "Z9999" → 339999, "25544" → 25544, "J1234" → 181234.
```

---

### PROMPT-3 — Parse SupGP Classification Flag and [PM] Post-Maneuver Tag

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py

Background:
In a TLE set, Line 1 column 8 (0-indexed: l1[7]) contains a classification character:
- 'U' = Standard SSN-derived GP data (lower fidelity, ~3 km average error)
- 'C' = CelesTrak-generated Supplemental GP (SupGP) data (~200 m average error)

Additionally, when a satellite is executing an active orbital maneuver (thruster burn),
CelesTrak appends "[PM]" to the satellite name on Line 0.

Task:
1. In the TLE parsing loop inside `fetch_tle_data`, after calling `Satrec.twoline2rv`:
   a. Read `data_source = l1[7]` (character at column 8, 0-indexed as index 7).
      Set `is_supgp = (data_source == 'C')`.
   b. Check if `name` ends with `" [PM]"`. If so, set `is_post_maneuver = True` and
      strip the `" [PM]"` suffix from the stored callsign so the name is clean.
   c. Add both fields to the `meta` dict:
      `"is_supgp": is_supgp`
      `"is_post_maneuver": is_post_maneuver`

2. In `propagation_loop`, include these two fields in the TAK event `detail` block:
   `tak_event["detail"]["is_supgp"] = meta["is_supgp"]`
   `tak_event["detail"]["is_post_maneuver"] = meta["is_post_maneuver"]`

3. In the log message at the end of `fetch_tle_data`, add a count of SupGP vs. standard
   objects: `f"  SupGP: {supgp_count}, Standard: {standard_count}"`.

4. Do NOT change any other logic or add new fetching behavior. This is a metadata
   enrichment pass only.
```

---

### PROMPT-4 — Epoch-Based Cache Deduplication

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py

Background:
CelesTrak's architecture docs state that if the epoch of a newly downloaded dataset
matches the locally cached epoch, the file write should be aborted to prevent unnecessary
I/O. For stable GEO and MEO satellites, the same epoch TLE may persist for 3–7 days.

Task:
1. Add a companion epoch cache file per group. The file path should be:
   `{cache_path}.epoch`
   It stores the epoch string of the last written TLE dataset (one line, the epoch of
   the first parsed satellite in the batch).

2. After a fresh HTTP 200 fetch, before writing `data_text` to the cache file:
   a. Parse the epoch from Line 1 of the first TLE in the response (columns 19–32,
      i.e., `first_l1[18:32].strip()`).
   b. Read the stored epoch from `{cache_path}.epoch` if it exists.
   c. If the epochs match, log `"Epoch unchanged for {param_val}, skipping cache write"`
      and skip the file write. Proceed to parse the already-downloaded `data_text`.
   d. If epochs differ (or no epoch file exists), write `data_text` to `cache_path` and
      write the new epoch string to `{cache_path}.epoch`.

3. The 2-hour mtime check for cache validity should remain unchanged. This deduplication
   only applies to the write step after a fresh network fetch.

4. Do NOT modify any other caching or fetch logic.
```

---

### PROMPT-5 — Expand Satellite Group Coverage

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py

Background:
The current service only tracks GNSS and weather satellites (6 groups). The CelesTrak
API exposes many more groups relevant to space situational awareness.

Task:
Add the following groups to `self.groups` in `OrbitalPulseService.__init__` and update
`self.GROUP_CATEGORY_MAP` accordingly. Groups are listed as (endpoint, param_val) tuples.

New groups to add:
  ("gp.php", "stations")        → category: "space_station"
  ("gp.php", "last-30-days")    → category: "recent_launch"
  ("gp.php", "starlink")        → category: "megaconstellation"
  ("gp.php", "oneweb")          → category: "megaconstellation"
  ("gp.php", "kuiper")          → category: "megaconstellation"
  ("gp.php", "cosmos-1408")     → category: "debris"
  ("gp.php", "fengyun-1c")      → category: "debris"
  ("gp.php", "iridium-33-debris") → category: "debris"
  ("gp.php", "analyst")         → category: "analyst"
  ("gp.php", "military")        → category: "military"

Important implementation notes:
1. The `starlink`, `oneweb`, and `kuiper` groups are very large (hundreds to thousands
   of objects). Add a configurable env var `ENABLE_MEGACONSTELLATIONS` (default "false").
   Only include these three groups if the env var is "true". Log a warning on startup
   that these groups add significant propagation load.

2. The `analyst` group contains objects with Alpha-5 catalog numbers. Ensure GAP-2
   (Alpha-5 parsing) is implemented before enabling this group.

3. The `military` group contains only unclassified (U) data. Add a comment clarifying
   this in the code.

4. Update the Kafka message `category` field for space_station objects to include the
   satellite name prominently, since there are very few stations and they are high-value
   targets.

5. Do NOT remove any existing groups. Existing groups remain as-is.
```

---

### PROMPT-6 — Migrate Fetch Format from TLE to OMM JSON

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py

Background:
The CelesTrak API supports JSON output of OMM (Orbit Mean-Elements Message) format
via `FORMAT=JSON`. This format:
- Uses full 9-digit NORAD catalog numbers (field: NORAD_CAT_ID)
- Uses ISO 8601 epoch strings (field: EPOCH) — no 2-digit year ambiguity
- Contains CLASSIFICATION field ('U' or 'C') directly in the JSON
- Contains OBJECT_NAME for the satellite name
- Contains MEAN_MOTION in revolutions/day (directly usable for period calc)
- Contains BSTAR, INCLINATION, RA_OF_ASC_NODE, ECCENTRICITY, ARG_OF_PERICENTER,
  MEAN_ANOMALY, and ELEMENT_SET_NO

Task:
1. Change the fetch URL in `fetch_tle_data` from `FORMAT=TLE` to `FORMAT=JSON`.

2. Replace the TLE text parser (the line-splitting loop) with a JSON parser:
   ```python
   records = json.loads(data_text)
   for record in records:
       name = record.get("OBJECT_NAME", "UNKNOWN")
       norad_id = int(record.get("NORAD_CAT_ID", 0))
       ...
   ```

3. Use `Satrec.twoline2rv` replacement: the sgp4 library provides
   `Satrec.twoline2rv` but also supports building from OMM via
   `sgp4.exporter` and the `Satrec` constructor. Use the `sgp4` library's
   `omm` module if available (`from sgp4 import omm`), or fall back to
   constructing a TLE string from the OMM fields for `twoline2rv`.

   The fallback TLE construction from OMM fields should be implemented as a
   helper function `omm_record_to_satrec(record: dict) -> Satrec`.

4. Extract CLASSIFICATION from `record.get("CLASSIFICATION", "U")` and set
   `is_supgp = (classification == 'C')` (replaces the col-8 parse from PROMPT-3).

5. Compute period using the OMM-native formula:
   `period_min = 1440.0 / float(record["MEAN_MOTION"])` if MEAN_MOTION > 0 else 0.

6. Store the ISO epoch string in meta as `"epoch": record.get("EPOCH", "")`.
   This is needed for the epoch-based cache dedup (PROMPT-4).

7. Update the epoch dedup logic (if implemented) to use this ISO string instead of
   the TLE column 19-32 extraction.

8. Maintain backward compatibility: if a JSON parse fails (e.g., malformed response),
   fall back to the legacy TLE parser with a logged warning.

9. Add the `FORMAT=JSON` change only to the HTTP URL fetch. The cache file extension
   should change from `.txt` to `.json` for newly fetched groups to distinguish format.
```

---

### PROMPT-7 — Fix Period Calculation to Use rev/day Mean Motion

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py

Background:
CelesTrak's architecture document specifies the canonical period formula as:
  Period (minutes) = 1440 / n
where n is mean motion in revolutions per day (the value in TLE Line 2 columns 53–63).

The current code uses:
  period_min = (2 * math.pi / sat.no_kozai) if sat.no_kozai > 0 else 0

`sat.no_kozai` is mean motion in radians/minute (an internal SGP4 intermediate value).
While mathematically equivalent (2π rad ÷ rad/min = min/rev), using an internal
attribute is fragile. The correct approach uses the TLE's stated revolutions/day.

Task:
1. After `Satrec.twoline2rv(l1, l2)`, extract mean motion directly from the TLE string:
   `mean_motion_revday = float(l2[52:63].strip())`

2. Compute period as:
   `period_min = 1440.0 / mean_motion_revday if mean_motion_revday > 0 else 0.0`

3. Remove the `sat.no_kozai` usage from the period calculation entirely.

4. If migrating to OMM JSON (PROMPT-6), use `float(record["MEAN_MOTION"])` from
   the JSON field directly (it is in rev/day), no TLE column extraction needed.

5. Add a log line at INFO level during the initial satellite load that shows the
   period range: min and max period_min across all loaded satellites, as a sanity check.

6. No other logic changes required.
```

---

### PROMPT-8 — Improve GMST/TEME→ECEF Accuracy with Astropy EOP

```
You are a backend engineer working on the Sovereign Watch orbital tracking system.

File to modify: backend/ingestion/orbital_pulse/main.py
requirements.txt file: backend/ingestion/orbital_pulse/requirements.txt

Background:
The current TEME→ECEF coordinate transform uses a simplified scalar GMST formula.
CelesTrak SupGP data is generated using precise Earth Orientation Parameters (EOP).
Using the simplified GMST introduces sub-km positioning errors, especially for
high-inclination LEO objects.

The `astropy` library provides a high-fidelity TEME→ITRS (ECEF) transform with
automatic EOP download and caching via `astropy.utils.iers`.

Task:
1. Add `astropy` to the requirements.txt if not already present.

2. At service startup (in `setup()`), call:
   ```python
   from astropy.utils import iers
   iers.conf.auto_download = True  # Cache EOP tables locally
   ```
   Wrap this in a try/except so failure to download EOP tables (offline environment)
   falls back gracefully to the existing GMST approximation with a logged warning.

3. Add a flag `self.use_astropy_teme: bool` set to True if astropy imported successfully.

4. In `propagation_loop`, after getting TEME r vectors from sgp4:
   If `self.use_astropy_teme` is True:
   ```python
   from astropy.coordinates import TEME, ITRS, CartesianRepresentation
   from astropy.time import Time
   import astropy.units as u

   t_astropy = Time(jd + fr, format='jd', scale='utc')
   r_teme_astropy = CartesianRepresentation(
       r_valid[:, 0] * u.km,
       r_valid[:, 1] * u.km,
       r_valid[:, 2] * u.km
   )
   teme_frame = TEME(r_teme_astropy, obstime=t_astropy)
   itrs_frame = teme_frame.transform_to(ITRS(obstime=t_astropy))
   r_ecef = np.column_stack([
       itrs_frame.cartesian.x.to(u.km).value,
       itrs_frame.cartesian.y.to(u.km).value,
       itrs_frame.cartesian.z.to(u.km).value
   ])
   ```
   Otherwise fall back to `self.teme_to_ecef_vectorized(r_valid, jd, fr)`.

5. The existing `teme_to_ecef_vectorized` method should remain as the fallback.
   Do NOT remove it.

6. Benchmark log: add a single DEBUG log line showing which ECEF method is in use
   on each propagation cycle.

7. Note: The `astropy` vectorized batch transform may be slower than the NumPy
   approximation for large satellite counts. If propagation cycle time exceeds
   25 seconds with astropy enabled, document this in a log warning and recommend
   the operator set `USE_PRECISE_ECEF=false` via env var to use the fast approximation.
   Add `USE_PRECISE_ECEF` env var support (default "true").
```

---

## Summary Table

| Prompt | Gap Fixed | Files Changed | Priority |
|---|---|---|---|
| PROMPT-1 | GAP-6 (429 / rate-limit) | `orbital_pulse/main.py` | P1 |
| PROMPT-2 | GAP-2 (Alpha-5 parsing) | `orbital_pulse/main.py` | P1 |
| PROMPT-3 | GAP-5 (SupGP C-flag + [PM]) | `orbital_pulse/main.py` | P2 |
| PROMPT-4 | GAP-4 (Epoch cache dedup) | `orbital_pulse/main.py` | P2 |
| PROMPT-5 | GAP-3 (Group coverage) | `orbital_pulse/main.py` | P2 |
| PROMPT-6 | GAP-1 (OMM JSON migration) | `orbital_pulse/main.py` | P3 |
| PROMPT-7 | GAP-7 (Period formula) | `orbital_pulse/main.py` | P3 |
| PROMPT-8 | GAP-8 (GMST/EOP accuracy) | `orbital_pulse/main.py`, `requirements.txt` | P3 |

**Suggested execution order:** PROMPT-2 → PROMPT-3 → PROMPT-1 → PROMPT-5 → PROMPT-4 → PROMPT-6 → PROMPT-7 → PROMPT-8

PROMPT-2 (Alpha-5) should precede PROMPT-5 (group expansion) because the analyst group
contains Alpha-5 objects. PROMPT-6 (OMM JSON) should precede PROMPT-7 (period formula)
since the OMM format exposes `MEAN_MOTION` in rev/day directly, simplifying that fix.
