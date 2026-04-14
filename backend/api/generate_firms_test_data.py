import asyncio
import os
import asyncpg
from datetime import datetime, timedelta, timezone

# --- Config (matches .env defaults) ---
DB_URL = os.getenv("DATABASE_URL", "postgres://postgres:password-4-testing@sovereign-timescaledb:5432/sovereign_watch")

async def generate_mock_data():
    conn = await asyncpg.connect(DB_URL)
    
    now = datetime.now(timezone.utc)
    
    # 1. Clear existing test data
    await conn.execute("DELETE FROM firms_hotspots WHERE source = 'MOCK_TEST_FEED'")
    
    # 2. Define a cluster of hotspots off the coast of Oregon
    # Approx 50nm west of Portland/Astoria
    test_hotslots = [
        # (lat, lon, frp, confidence, satellite, daynight)
        (45.6, -125.1, 45.5, 'high',    'SNPP', 'N'), # Large, Night, High Conf
        (45.7, -125.2, 12.2, 'nominal', 'SNPP', 'N'), # Small, Night, Nominal
        (45.5, -125.0, 5.8,  'low',     'Aqua', 'D'), # Low Conf, Day
        (45.8, -125.3, 33.1, 'high',    'NOAA-20', 'N'), # Large, Night
        (46.0, -125.5, 8.5,  'nominal', 'Terra', 'D'), # Medium, Day
    ]
    
    print(f"Injecting {len(test_hotslots)} mock FIRMS hotspots...")
    
    for i, (lat, lon, frp, conf, sat, dn) in enumerate(test_hotslots):
        # Slightly vary the timestamp for each
        obs_time = now - timedelta(minutes=i*15)
        
        await conn.execute("""
            INSERT INTO firms_hotspots 
            (time, latitude, longitude, geom, brightness, frp, confidence, satellite, instrument, source, daynight, acq_date, acq_time)
            VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT DO NOTHING
        """, 
            obs_time, lat, lon, lon, lat, 
            310.5 + i, frp, conf, sat, 'VIIRS' if 'SNPP' in sat else 'MODIS', 
            'MOCK_TEST_FEED', dn, obs_time.date(), obs_time.strftime("%H%M")
        )

    await conn.close()
    print("Injection complete. Refresh the UI and toggle 'NASA FIRMS' and 'Dark Vessels' to verify.")

if __name__ == "__main__":
    asyncio.run(generate_mock_data())
