# FCC Tower Parsing Bug Fix

## Issue
All FCC towers displayed on the web interface had the same owner ("City of Gillette") and the same elevation data. This meant that every tower was being erroneously linked to a single metadata record while we ingested it from the `r_tower.zip` download.

## Solution
Investigated the Antenna Structure Registration (ASR) mapping logic inside `backend/ingestion/infra_poller/main.py`. The ingestion poller iterated over `EN.dat` (entity owner data), `RA.dat` (structure registration height data), and `CO.dat` (coordinates). 

The old code was extracting `usi = row[1]` for the Unique System Identifier. However, according to the ULS data schema inside the CSVs:
- `row[0]` is the record type indicator (e.g. `EN`)
- `row[1]` is an application/registration content indicator (always `"REG"` for `r_tower.zip`)
- `row[2]` is the FCC ID (Registration Number)
- `row[3]` is the true Unique System Identifier (USI)

Because the script used `row[1]`, the string "REG" was assigned as the USI key for every single row. The `owner_by_usi` and `ra_by_usi` dictionaries were constantly overwritten under the key "REG", causing all towers parsed from `CO.dat` to fetch the metadata of the last tower listed in the file.

## Changes
- `backend/ingestion/infra_poller/main.py`: Changed the USI indexing from `row[1]` to `row[3]` in `EN.dat`, `RA.dat`, and `CO.dat` parser loops to correctly capture the true integer USI identifier.

## Verification
- Verified by rebuilding `sovereign-infra-poller` via `docker compose up -d --build sovereign-infra-poller`.
- Ingested files were verified against sample extracts of `EN.dat`, `RA.dat`, and `CO.dat` through local parsing scripts indicating USI represents an integer starting from column index 3.

## Benefits
Accurate structure registration properties, height parameters, and data ownership are now appropriately joined across thousands of towers, restoring infrastructure-level operational situational awareness for the end user and AI analysts.
