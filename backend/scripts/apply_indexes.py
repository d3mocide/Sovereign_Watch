import asyncio
import asyncpg
import os

DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASS = os.getenv("POSTGRES_PASSWORD")
if not DB_PASS:
    print("Error: POSTGRES_PASSWORD environment variable is not set.")
    exit(1)

DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "sovereign_watch")

DSN = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

async def apply_indexes():
    print(f"Connecting to {DSN}...")
    try:
        conn = await asyncpg.connect(DSN)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    print("Enabling pg_trgm extension...")
    await conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")

    print("Creating index on entity_id...")
    await conn.execute("CREATE INDEX IF NOT EXISTS ix_tracks_entity_id_trgm ON tracks USING gin (entity_id gin_trgm_ops);")

    print("Creating index on meta->>'callsign'...")
    await conn.execute("CREATE INDEX IF NOT EXISTS ix_tracks_meta_callsign_trgm ON tracks USING gin ((meta->>'callsign') gin_trgm_ops);")

    print("Indexes applied successfully.")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(apply_indexes())
