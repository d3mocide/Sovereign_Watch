#!/usr/bin/env python3
"""
TimescaleDB Manual Cleanup Script
Immediately drops chunks older than specified retention period
"""
import os
import psycopg2
from datetime import datetime

# Database connection parameters
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "sovereign_watch")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD")

if not DB_PASSWORD:
    print("❌ Error: POSTGRES_PASSWORD environment variable is not set.")
    exit(1)

# Retention period (default: 24 hours)
RETENTION_HOURS = int(os.getenv("RETENTION_HOURS", "24"))


def cleanup_old_data():
    """Drop chunks older than retention period."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        
        cursor = conn.cursor()
        
        # Drop old chunks
        print(f"🗑️ Dropping chunks older than {RETENTION_HOURS} hours...")
        cursor.execute("SELECT drop_chunks('tracks', %s::interval);", (f"{RETENTION_HOURS} hours",))
        
        # Get database size
        cursor.execute("""
            SELECT pg_size_pretty(pg_database_size(%s));
        """, (DB_NAME,))
        
        db_size = cursor.fetchone()[0]
        print(f"📊 Current database size: {db_size}")
        
        # Get chunk count
        cursor.execute("""
            SELECT COUNT(*) FROM timescaledb_information.chunks
            WHERE hypertable_name = 'tracks';
        """)
        
        chunk_count = cursor.fetchone()[0]
        print(f"📦 Active chunks: {chunk_count}")
        
        # Get oldest data timestamp
        cursor.execute("SELECT MIN(time) FROM tracks;")
        oldest = cursor.fetchone()[0]
        
        if oldest:
            print(f"⏰ Oldest data: {oldest}")
            age = datetime.now(oldest.tzinfo) - oldest
            print(f"📅 Data retention: {age.days} days, {age.seconds // 3600} hours")
        else:
            print("ℹ️ No data in tracks table")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("✅ Cleanup complete!")
        
    except Exception as e:
        print(f"❌ Cleanup failed: {e}")
        raise


if __name__ == "__main__":
    cleanup_old_data()
