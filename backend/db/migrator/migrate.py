"""
Sovereign Watch — idempotent SQL migration runner.

How it works
------------
1. Connects to Postgres and creates a ``schema_migrations`` tracking table if
   it does not already exist.
2. If the database was bootstrapped by Docker's ``docker-entrypoint-initdb.d``
   (i.e. the ``tracks`` table already exists but V001 has not been stamped),
   it stamps V001 so the baseline is never re-applied.
3. Scans ``/migrations/V[0-9]*.sql`` in lexicographic order and applies any
   version not yet recorded in ``schema_migrations``, inside a transaction.

Adding a migration
------------------
Drop a file like ``V002__add_aurora_table.sql`` into ``backend/db/migrations/``.
The runner applies it once and records it; subsequent restarts skip it.
"""

import asyncio
import glob
import os
import sys

import asyncpg

MIGRATIONS_DIR = "/migrations"
DATABASE_URL = os.environ["DATABASE_URL"]


async def run() -> None:
    print("Connecting to database...")
    try:
        conn = await asyncpg.connect(DATABASE_URL)
    except Exception as exc:
        print(f"ERROR: Could not connect to database: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        # --- ensure tracking table exists -----------------------------------
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version    TEXT        PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT NOW()
            )
            """
        )

        # --- stamp V001 if init.sql already ran (existing volume) -----------
        v001_stamped = await conn.fetchval(
            "SELECT 1 FROM schema_migrations WHERE version = 'V001'"
        )
        if not v001_stamped:
            tracks_exists = await conn.fetchval(
                """
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'tracks'
                """
            )
            if tracks_exists:
                await conn.execute(
                    "INSERT INTO schema_migrations(version) VALUES('V001')"
                    " ON CONFLICT DO NOTHING"
                )
                print("Stamped V001 (baseline already applied by init.sql).")
            else:
                # Genuinely empty DB — init.sql must not be mounted. Warn and
                # continue; the migration files (if any start from V001) will
                # handle bootstrap, otherwise the DB will be empty.
                print(
                    "WARNING: 'tracks' table not found. "
                    "Ensure init.sql is mounted at docker-entrypoint-initdb.d "
                    "or provide a V001 migration file.",
                    file=sys.stderr,
                )

        # --- collect applied versions ----------------------------------------
        applied = {
            row["version"]
            for row in await conn.fetch("SELECT version FROM schema_migrations")
        }

        # --- find migration files, sorted lexicographically ------------------
        files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "V[0-9]*.sql")))

        pending_count = 0
        for path in files:
            filename = os.path.basename(path)
            # "V002__add_aurora_table.sql" -> "V002"
            version = filename.split("__")[0].upper()

            if version in applied:
                continue

            print(f"Applying {filename} ...")
            with open(path, encoding="utf-8") as fh:
                sql = fh.read()

            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations(version) VALUES($1)", version
                )

            print(f"  {version} applied OK.")
            pending_count += 1

        if pending_count == 0:
            print("No pending migrations — schema is up to date.")
        else:
            print(f"Applied {pending_count} migration(s) successfully.")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run())
