import asyncio
import asyncpg
import os
import random
import time
import json
from datetime import datetime, timedelta

# Adjust path to import settings if needed, or just hardcode for the script to be standalone
# Adding backend/api to sys.path to import core.config if we wanted, but let's keep it simple and robust.

DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASS = os.getenv("POSTGRES_PASSWORD")

if not DB_PASS:
    print("Error: POSTGRES_PASSWORD environment variable is not set.")
    exit(1)

DB_HOST = os.getenv("POSTGRES_HOST", "localhost") # Default to localhost for external script execution
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "sovereign_watch")

DSN = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

async def generate_mock_data(pool, count=10000):
    print(f"Generating {count} mock tracks...")

    # We'll insert in batches
    batch_size = 1000
    rows = []

    entities = [f"ENT-{i}" for i in range(1000)] # 1000 unique entities

    for i in range(count):
        entity_id = random.choice(entities)
        # Random time in last 24h
        ts = datetime.now() - timedelta(minutes=random.randint(0, 1440))
        lat = random.uniform(-90, 90)
        lon = random.uniform(-180, 180)
        meta = json.dumps({
            "callsign": f"CALL-{random.randint(1000, 9999)}-{random.choice(['A', 'B', 'C'])}",
            "type": "land"
        })

        rows.append((ts, entity_id, "ground", lat, lon, meta))

        if len(rows) >= batch_size:
            await pool.executemany("""
                INSERT INTO tracks (time, entity_id, type, lat, lon, meta)
                VALUES ($1, $2, $3, $4, $5, $6)
            """, rows)
            rows = []
            print(f"Inserted {i+1} rows...", end='\r')

    if rows:
        await pool.executemany("""
            INSERT INTO tracks (time, entity_id, type, lat, lon, meta)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, rows)
    print("\nData generation complete.")

async def benchmark():
    print(f"Connecting to {DSN}...")
    try:
        pool = await asyncpg.create_pool(DSN)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    # Check row count
    row_count = await pool.fetchval("SELECT COUNT(*) FROM tracks")
    print(f"Current row count: {row_count}")

    if row_count < 50000:
        await generate_mock_data(pool, 50000 - row_count)
    else:
        print("Sufficient data exists.")

    # Force analyze to update stats
    await pool.execute("ANALYZE tracks")

    # Benchmark Query
    # We use a pattern that matches the middle to force scan if no trigram index
    search_term = "ENT-50" # Matches ENT-500, ENT-501...

    query = """
        SELECT DISTINCT ON (entity_id) entity_id, type, time as last_seen, lat, lon, meta
        FROM tracks
        WHERE entity_id ILIKE $1 OR meta->>'callsign' ILIKE $1
        ORDER BY entity_id, time DESC
        LIMIT 10
    """

    pattern = f"%{search_term}%"

    print(f"\nRunning benchmark for pattern: '{pattern}'")

    # Warmup
    await pool.fetch(query, pattern, 10)

    times = []
    for i in range(10):
        start = time.perf_counter()
        await pool.fetch(query, pattern, 10)
        end = time.perf_counter()
        times.append(end - start)

    avg_time = sum(times) / len(times)
    print(f"Average Execution Time: {avg_time*1000:.2f} ms")

    # Explain Analyze
    print("\n--- EXPLAIN ANALYZE ---")
    explain_query = "EXPLAIN ANALYZE " + query
    rows = await pool.fetch(explain_query, pattern, 10)
    for row in rows:
        print(row['QUERY PLAN'])

    await pool.close()

if __name__ == "__main__":
    asyncio.run(benchmark())
