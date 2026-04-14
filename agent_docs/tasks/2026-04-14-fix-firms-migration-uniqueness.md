# Task: Fix FIRMS Migration Hypertable Uniqueness

## Issue
The migration `V004__firms_dark_vessel.sql` failed with:
`asyncpg.exceptions._base.UnknownPostgresError: cannot create a unique index without the column "time" (used in partitioning)`

This is a TimescaleDB requirement for hypertables: any unique index/constraint must include the partitioning column (in this case, `time`).
Additionally, the ingestion code in `firms.py` used `ON CONFLICT ON CONSTRAINT ix_firms_hotspots_dedup`, but the migration created a unique index, not a constraint, which would have caused a second error in Postgres even if the TimescaleDB requirement was met.

## Solution
1.  Modify `backend/db/migrations/V004__firms_dark_vessel.sql` to use a named unique constraint instead of a unique index.
2.  Include the `time` partitioning column in the unique constraint.
3.  Ensure the constraint is properly registered so `ON CONFLICT ON CONSTRAINT` works correctly.

## Changes
- [MODIFY] [V004__firms_dark_vessel.sql](file:///d:/Projects/Sovereign_Watch/backend/db/migrations/V004__firms_dark_vessel.sql)

## Verification
- Restart the backend container and verify that `migrate.py` completes successfully.
- Verify `sovereign-backend` status is healthy.
