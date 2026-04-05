# Database Migrations

Files here are applied **once**, in lexicographic order, by the
`sovereign-db-migrate` container on every `docker compose up`.

## Naming convention

```
V<NNN>__<short_description>.sql
```

Examples:
- `V002__add_aurora_observations_table.sql`
- `V003__drop_legacy_rf_events_table.sql`
- `V004__add_index_tracks_geom_partial.sql`

**V001 is reserved** — it maps to the baseline `init.sql` that Docker applies
on a fresh volume.  Start your migrations at **V002**.

## Rules

1. **Never edit an already-applied migration file.**  
   Once a version is in `schema_migrations`, it will never be re-run.
   Edit a migration *before* it is applied; after that, make a new one.

2. **Each file should be idempotent where possible.**  
   Use `IF NOT EXISTS`, `IF EXISTS`, `ADD COLUMN IF NOT EXISTS`, etc.
   This is belt-and-suspenders protection if something went wrong mid-apply.

3. **One logical change per file.**  
   Keeps the history readable and rollbacks (manual) simpler.

## Checking status

Connect to the running TimescaleDB container and query:

```sql
SELECT * FROM schema_migrations ORDER BY version;
```
