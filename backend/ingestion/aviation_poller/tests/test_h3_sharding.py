"""
Unit tests for H3PriorityManager (Ingest-13).

All tests use fakeredis — no live Redis connection required.
Run from the aviation_poller directory:
    python -m pytest tests/test_h3_sharding.py -v
"""
import json
import time

import fakeredis.aioredis as fake_redis
import h3
import pytest

from h3_sharding import H3PriorityManager

# Portland, OR — default test centre
CENTER_LAT = 45.5152
CENTER_LON = -122.6784
RADIUS_KM  = 278.0   # 150 nm


@pytest.fixture
async def manager():
    """H3PriorityManager with an in-process fake Redis backend."""
    mgr = H3PriorityManager()
    mgr.redis = fake_redis.FakeRedis(decode_responses=True)
    yield mgr
    await mgr.close()


# ---------------------------------------------------------------------------
# 1. initialize_region — cell count
# ---------------------------------------------------------------------------
async def test_initialize_region_cell_count(manager):
    """
    initialize_region for a 150nm zone (k=12) should seed 469 cells.
    3n(n+1)+1 for n=12 → 3*12*13+1 = 469.
    """
    await manager.initialize_region(CENTER_LAT, CENTER_LON, RADIUS_KM)
    count = await manager.redis.zcard(manager.KEY_QUEUE)
    # k = floor(278/22) = 12 → exactly 469 cells
    assert count == 469


# ---------------------------------------------------------------------------
# 2. initialize_region — nx idempotency
# ---------------------------------------------------------------------------
async def test_initialize_region_nx_idempotent(manager):
    """
    Calling initialize_region twice must not overwrite the score of cells
    that were already present (nx=True semantics).
    """
    await manager.initialize_region(CENTER_LAT, CENTER_LON, RADIUS_KM)

    # Artificially advance one cell's score to simulate an active cell
    cells = await manager.redis.zrange(manager.KEY_QUEUE, 0, 0)
    sentinel_cell = cells[0]
    future_score = time.time() + 9999.0
    await manager.redis.zadd(manager.KEY_QUEUE, {sentinel_cell: future_score})

    # Second seed — should NOT overwrite the sentinel score
    await manager.initialize_region(CENTER_LAT, CENTER_LON, RADIUS_KM)

    score = await manager.redis.zscore(manager.KEY_QUEUE, sentinel_cell)
    assert score == pytest.approx(future_score, rel=1e-6)


# ---------------------------------------------------------------------------
# 3. get_next_batch — ZSET ordering
# ---------------------------------------------------------------------------
async def test_get_next_batch_ordering(manager):
    """
    get_next_batch must return the cell(s) with the lowest score (earliest
    next_poll timestamp) — i.e. ZRANGE returns ascending by score.
    """
    await manager.initialize_region(CENTER_LAT, CENTER_LON, RADIUS_KM)

    # Push one cell far into the future so it sorts last
    all_cells = await manager.redis.zrange(manager.KEY_QUEUE, 0, -1)
    last_cell = all_cells[-1]
    await manager.redis.zadd(manager.KEY_QUEUE, {last_cell: time.time() + 10_000})

    batch = await manager.get_next_batch(batch_size=3)
    assert len(batch) == 3
    # None of the returned cells should be the one we pushed to the end
    assert last_cell not in batch


# ---------------------------------------------------------------------------
# 4. update_priority — active cell (count > 0)
# ---------------------------------------------------------------------------
async def test_update_priority_active_cell(manager):
    """
    After update_priority with count > 0, the cell's score must equal
    approximately now + INTERVAL_ACTIVE (10 s).
    """
    await manager.initialize_region(CENTER_LAT, CENTER_LON, RADIUS_KM)
    cell = (await manager.get_next_batch(1))[0]

    before = time.time()
    await manager.update_priority(cell, aircraft_count=5)
    after = time.time()

    score = await manager.redis.zscore(manager.KEY_QUEUE, cell)
    assert before + manager.INTERVAL_ACTIVE <= score <= after + manager.INTERVAL_ACTIVE + 1


# ---------------------------------------------------------------------------
# 5. update_priority — empty cell (count == 0)
# ---------------------------------------------------------------------------
async def test_update_priority_empty_cell(manager):
    """
    After update_priority with count == 0, the cell's score must equal
    approximately now + INTERVAL_EMPTY (60 s).
    """
    await manager.initialize_region(CENTER_LAT, CENTER_LON, RADIUS_KM)
    cell = (await manager.get_next_batch(1))[0]

    before = time.time()
    await manager.update_priority(cell, aircraft_count=0)
    after = time.time()

    score = await manager.redis.zscore(manager.KEY_QUEUE, cell)
    assert before + manager.INTERVAL_EMPTY <= score <= after + manager.INTERVAL_EMPTY + 1


# ---------------------------------------------------------------------------
# 6. get_cell_center_radius — valid coordinates and fixed radius
# ---------------------------------------------------------------------------
async def test_get_cell_center_radius(manager):
    """
    get_cell_center_radius must return (lat, lon, CELL_RADIUS_NM) where
    lat/lon lie within the bounds of the H3 cell.
    """
    center_cell = h3.latlng_to_cell(CENTER_LAT, CENTER_LON, H3PriorityManager.RESOLUTION)
    lat, lon, radius_nm = manager.get_cell_center_radius(center_cell)

    assert radius_nm == manager.CELL_RADIUS_NM

    # The returned lat/lon must be the cell's canonical centre (within 1e-6 deg)
    expected_lat, expected_lon = h3.cell_to_latlng(center_cell)
    assert lat == pytest.approx(expected_lat, abs=1e-6)
    assert lon == pytest.approx(expected_lon, abs=1e-6)


# ---------------------------------------------------------------------------
# 7. Resolution-4 cell area sanity check
# ---------------------------------------------------------------------------
async def test_resolution_4_cell_area():
    """
    H3 Resolution-4 cells must be in the expected area range (~1770 km²).
    Uses h3.average_hexagon_area which does not require a Redis fixture.
    """
    avg_area_km2 = h3.average_hexagon_area(H3PriorityManager.RESOLUTION, unit="km^2")
    # Res-4 average is ~1770 km². Allow generous tolerance for pentagons.
    assert 1_000 < avg_area_km2 < 2_500


# ---------------------------------------------------------------------------
# 8. close — releases the Redis connection
# ---------------------------------------------------------------------------
async def test_close_releases_redis(manager):
    """After close(), manager.redis must be None."""
    assert manager.redis is not None
    await manager.close()
    assert manager.redis is None


# ---------------------------------------------------------------------------
# 9. update_priority — publishes state to KEY_STATE
# ---------------------------------------------------------------------------
async def test_update_priority_publishes_state(manager):
    """
    update_priority must write a JSON state blob to h3:cell_state so the
    FE-09 debug API can read it.
    """
    await manager.initialize_region(CENTER_LAT, CENTER_LON, RADIUS_KM)
    cell = (await manager.get_next_batch(1))[0]

    await manager.update_priority(cell, aircraft_count=7)

    raw = await manager.redis.hget(manager.KEY_STATE, cell)
    assert raw is not None
    state = json.loads(raw)
    assert state["count"] == 7
    assert state["interval_s"] == manager.INTERVAL_ACTIVE
    assert "next_poll" in state
