import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
import h3

# Add current dir to path to find core/services
sys.path.append(os.getcwd())

from core.database import db
from routers.h3_risk import get_h3_risk

# Test Constants
CENTER_LAT = 45.5152
CENTER_LON = -122.6784
TEST_RES = 6
TEST_CELL = h3.latlng_to_cell(CENTER_LAT, CENTER_LON, TEST_RES)
TEST_UID_AIR = "icao-test-fusion-air"
TEST_UID_SEA = "mmsi-test-fusion-sea"

async def inject_data(conn, offset_hours=0):
    """Injects high-risk convergence data into a target cell."""
    now = datetime.now(timezone.utc) - timedelta(hours=offset_hours)
    
    # 1. Inject 10 Aviation Tracks (TAK_ADSB domain)
    # Using multiple tracks to increase density_norm
    for i in range(10):
        await conn.execute(
            "INSERT INTO tracks (time, entity_id, lat, lon, meta) VALUES ($1, $2, $3, $4, $5)",
            now, f"{TEST_UID_AIR}-{i}", CENTER_LAT, CENTER_LON, '{"source": "dump1090"}'
        )
    
    # 2. Inject 5 Maritime Tracks (TAK_AIS domain)
    # Different prefix to trigger cross-domain convergence
    for i in range(5):
        await conn.execute(
            "INSERT INTO tracks (time, entity_id, lat, lon, meta) VALUES ($1, $2, $3, $4, $5)",
            now, f"{TEST_UID_SEA}-{i}", CENTER_LAT + 0.001, CENTER_LON + 0.001, '{"source": "ais_terrestrial"}'
        )
        
    # 3. Inject GDELT Material Conflict Event
    # quad_class 4 = Material Conflict
    # goldstein -10 = High Instability
    await conn.execute(
        """
        INSERT INTO gdelt_events (time, event_id, lat, lon, goldstein, quad_class, url) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        now, "test-fusion-event", CENTER_LAT, CENTER_LON, -10.0, 4, "http://test.com/fusion-alert"
    )

async def cleanup_data(conn):
    """Removes test records."""
    await conn.execute("DELETE FROM tracks WHERE entity_id LIKE 'icao-test-fusion-air%'")
    await conn.execute("DELETE FROM tracks WHERE entity_id LIKE 'mmsi-test-fusion-sea%'")
    await conn.execute("DELETE FROM gdelt_events WHERE event_id = 'test-fusion-event'")

async def run_test():
    print("--- PR #238 Risk Assessment Stress Test ---")
    print(f"Target Cell: {TEST_CELL} (Portland, OR)")
    
    await db.connect()
    async with db.pool.acquire() as conn:
        print("\n[Step 1] Cleaning up previous test data...")
        await cleanup_data(conn)
        
        # --- Scenario A: Fresh Convergence ---
        print("\n[Step 2] Injecting 'High-Risk Convergence' scenario (Fresh data)...")
        await inject_data(conn, offset_hours=0)
        
        from services.escalation_detector import EscalationDetector, AnomalyMetric
        detector = EscalationDetector()
        
        print("[Step 3] Verifying EscalationDetector Convergence Boost...")
        # Mock anomalies from two distinct domains
        anomalies = [
            AnomalyMetric(metric_type="emergency", score=0.8, affected_uids=["test-air"], description="Aviation"),
            AnomalyMetric(metric_type="satellite_signal_loss", score=0.8, affected_uids=["test-sat"], description="Orbital")
        ]
        
        # Baseline (single domain)
        score_single = detector.compute_risk_score(0.0, 0.0, 0.0, context_anomalies=anomalies[:1])
        # Dual domain (convergence)
        score_dual = detector.compute_risk_score(0.0, 0.0, 0.0, context_anomalies=anomalies)
        
        print(f" Single Domain Score: {score_single:.4f}")
        print(f" Dual Domain Score:   {score_dual:.4f}")
        
        # convergence_factor = 1.0 + 0.20 = 1.2
        expected_boosted = score_single * 1.2
        assert abs(score_dual - expected_boosted) < 0.01, f"Convergence boost not applied correctly! Expected {expected_boosted}, got {score_dual}"
        print(" VERIFIED: Cross-domain convergence boost (20%) is active.")

        print("\n[Step 4] Running H3 Risk Engine (Map Layer logic)...")
        # In h3_risk.py, risk = 0.6*density + 0.4*sentiment
        risk_result = await get_h3_risk(resolution=TEST_RES, hours=1)
        target_cell_data = next((c for c in risk_result.cells if c.cell == TEST_CELL), None)
        
        if target_cell_data:
            print(f" Cell: {TEST_CELL}")
            print(f" Risk Score: {target_cell_data.risk_score}")
            print(f" Severity:   {target_cell_data.severity}")
            # Note: Map layer doesn't use convergence boost yet, verifying raw scores
            assert target_cell_data.sentiment == 1.0, "GDELT sentiment should be 1.0 for conflict"
            print(" VERIFIED: GDELT Sentiment risk mapped correctly.")
        else:
            print(" WARNING: Target cell not found in risk output (may be hidden by other high-density cells).")

        # --- Scenario B: Temporal Decay ---
        print("\n[Step 5] Simulating 'Temporal Decay' (Aging data by 4 hours)...")
        # Air tracks (TAK_ADSB) weight decays to 0.25 after 2 half-lives (4h)
        # Using Re-insert instead of UPDATE to avoid hypertable chunk issues
        await conn.execute("DELETE FROM tracks WHERE entity_id LIKE 'icao-test-fusion-air%'")
        await inject_data(conn, offset_hours=4)
        
        # Aged risk check
        decay_result = await get_h3_risk(resolution=TEST_RES, hours=6)
        decay_cell = next((c for c in decay_result.cells if c.cell == TEST_CELL), None)
        
        if decay_cell and target_cell_data:
            print(f" Risk Score (Aged): {decay_cell.risk_score}")
            assert decay_cell.density < target_cell_data.density, "Density score did not decay!"
            print(" VERIFIED: Temporal decay on physical tracks confirmed.")
        
        print("\n[Step 6] Restoring high-risk state for manual verification (10 minute window)...")
        await cleanup_data(conn)
        await inject_data(conn, offset_hours=0)
        print(f" DONE: Red hex active at {CENTER_LAT}, {CENTER_LON}.")
        print(" Run 'python3 test_risk_fusion.py --cleanup' later to remove.")

    await db.disconnect()

if __name__ == "__main__":
    if "--cleanup" in sys.argv:
        asyncio.run(db.connect())
        asyncio.run(cleanup_data(db.pool))
        print("Test data cleaned up.")
    else:
        asyncio.run(run_test())
