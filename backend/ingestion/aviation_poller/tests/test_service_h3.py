"""
Integration tests verifying that PollerService correctly uses H3PriorityManager
(Ingest-13 wiring in service.py).

These tests mock all external I/O (Redis, Kafka, HTTP) so no containers are
required.  Run from the aviation_poller directory:
    python -m pytest tests/test_service_h3.py -v
"""
import asyncio
import json
import time
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis as fake_redis
import pytest

# conftest.py has already added the aviation_poller dir to sys.path
from service import PollerService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_fake_redis():
    """Return a FakeRedis instance with decode_responses=True."""
    return fake_redis.FakeRedis(decode_responses=True)


async def _setup_service(service: PollerService, fake_redis_instance):
    """
    Partial setup: wire fake Redis into both the service and its H3 manager,
    bypassing real network connections.
    """
    service.redis_client = fake_redis_instance
    service.pubsub = AsyncMock()
    service.pubsub.subscribe = AsyncMock()
    service.pubsub.connection = True

    service.producer = AsyncMock()
    service.producer.start = AsyncMock()
    service.producer.stop = AsyncMock()
    service.producer.send = AsyncMock()

    await service.poller.start()           # creates an aiohttp session (real but unused)
    service.h3_manager.redis = fake_redis_instance


# ---------------------------------------------------------------------------
# 1. setup() initialises the H3 manager
# ---------------------------------------------------------------------------
async def test_setup_initializes_h3_manager():
    """
    After a successful setup(), h3_manager.redis must be non-None and the
    H3 poll queue must contain cells for the default mission area.
    """
    fake_r = _make_fake_redis()
    service = PollerService()

    with (
        patch("service.redis.from_url", return_value=fake_r),
        patch("service.AIOKafkaProducer", return_value=AsyncMock(
            start=AsyncMock(), stop=AsyncMock(), send=AsyncMock()
        )),
        patch("h3_sharding.redis.from_url", return_value=fake_r),
        patch.object(service, "load_active_mission", new_callable=AsyncMock),
    ):
        await service.setup()

    assert service.h3_manager.redis is not None
    queue_size = await fake_r.zcard("h3:poll_queue")
    assert queue_size > 0

    await service.poller.close()
    await service.h3_manager.close()


# ---------------------------------------------------------------------------
# 2. source_loop() pulls cells from the H3 queue and calls update_priority
# ---------------------------------------------------------------------------
async def test_source_loop_polls_from_h3_queue():
    """
    One iteration of source_loop must:
      - call h3_manager.get_next_batch(batch_size=1)
      - poll the resulting cell via _fetch
      - call h3_manager.update_priority with the aircraft count
    """
    fake_r = _make_fake_redis()
    service = PollerService()
    await _setup_service(service, fake_r)

    # Pre-seed a single cell so get_next_batch returns it
    import h3 as _h3
    test_cell = _h3.latlng_to_cell(45.5, -122.7, 4)
    await fake_r.zadd("h3:poll_queue", {test_cell: time.time() - 1})

    three_aircraft = [
        {"hex": "abc001", "lat": 45.5, "lon": -122.7, "flight": "TST001"},
        {"hex": "abc002", "lat": 45.6, "lon": -122.8, "flight": "TST002"},
        {"hex": "abc003", "lat": 45.4, "lon": -122.6, "flight": "TST003"},
    ]

    update_priority_calls = []

    async def fake_update_priority(cell, aircraft_count):
        update_priority_calls.append((cell, aircraft_count))

    service.h3_manager.update_priority = fake_update_priority

    with patch.object(
        service.poller, "_fetch", new_callable=AsyncMock,
        return_value={"ac": three_aircraft}
    ):
        # Run one loop iteration then cancel
        service.running = True

        async def one_shot():
            await service.source_loop(0)

        task = asyncio.create_task(one_shot())
        # Give the loop enough time to complete one fetch-and-update cycle
        await asyncio.sleep(0.3)
        service.running = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert len(update_priority_calls) >= 1
    called_cell, called_count = update_priority_calls[0]
    assert called_cell == test_cell
    assert called_count == 3

    await service.poller.close()


# ---------------------------------------------------------------------------
# 3. navigation_listener() flushes and re-seeds on mission pivot
# ---------------------------------------------------------------------------
async def test_mission_update_reseeds_h3_queue():
    """
    When a navigation-updates message arrives, the service must flush the
    existing H3 queue and re-seed it for the new mission centre.
    """
    fake_r = _make_fake_redis()
    service = PollerService()
    await _setup_service(service, fake_r)

    # Pre-seed the queue for the old area
    import h3 as _h3
    old_cell = _h3.latlng_to_cell(45.5, -122.7, 4)
    await fake_r.zadd("h3:poll_queue", {old_cell: time.time()})

    flush_called = []
    init_calls = []

    async def fake_flush():
        flush_called.append(True)
        await fake_r.delete("h3:poll_queue")
        # Stop the listener so it exits after processing this one update,
        # avoiding an infinite loop (fake_listen has no await, so the while
        # loop would spin without yielding control back to the test).
        service.running = False

    async def fake_init(lat, lon, radius_km):
        init_calls.append((lat, lon, radius_km))

    service.h3_manager.flush_region = fake_flush
    service.h3_manager.initialize_region = fake_init

    new_mission = {"lat": 47.6062, "lon": -122.3321, "radius_nm": 100}
    nav_message = {"type": "message", "data": json.dumps(new_mission)}

    # Simulate pubsub delivering one message then ending.
    # After fake_flush sets running=False the listener's inner `if not
    # self.running: break` fires and the task completes naturally.
    async def fake_listen():
        yield {"type": "subscribe", "data": 1}
        yield nav_message

    service.pubsub.listen = fake_listen
    service.running = True

    await service.navigation_listener()   # runs to completion (no cancel needed)

    assert flush_called, "flush_region was not called on mission pivot"
    assert init_calls, "initialize_region was not called after flush"
    lat, lon, radius_km = init_calls[0]
    assert lat == pytest.approx(47.6062)
    assert lon == pytest.approx(-122.3321)
    assert radius_km == pytest.approx(100 * 1.852, rel=1e-3)

    await service.poller.close()


# ---------------------------------------------------------------------------
# 4. Small radius still uses H3 (no fixed-point shortcut)
# ---------------------------------------------------------------------------
async def test_small_radius_uses_h3_queue():
    """
    Even for a radius_nm < 50, source_loop must pull from the H3 queue
    rather than falling back to the old fixed single-point path.
    The H3 queue must be seeded with at least one cell for a small AOR.
    """
    fake_r = _make_fake_redis()
    service = PollerService()
    service.radius_nm = 30  # small tactical area
    await _setup_service(service, fake_r)

    get_batch_calls = []
    original_get = service.h3_manager.get_next_batch

    async def tracked_get_next_batch(batch_size=1):
        result = await original_get(batch_size)
        get_batch_calls.append(result)
        return result

    service.h3_manager.get_next_batch = tracked_get_next_batch

    # Seed a cell for the small AOR
    import h3 as _h3
    small_cell = _h3.latlng_to_cell(service.center_lat, service.center_lon, 4)
    await fake_r.zadd("h3:poll_queue", {small_cell: time.time() - 1})

    with patch.object(
        service.poller, "_fetch", new_callable=AsyncMock,
        return_value={"ac": []}
    ):
        patch.object(service.h3_manager, "update_priority", new_callable=AsyncMock)
        service.running = True

        async def one_shot():
            await service.source_loop(0)

        task = asyncio.create_task(one_shot())
        await asyncio.sleep(0.3)
        service.running = False
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert get_batch_calls, "get_next_batch was never called — H3 queue not used"

    await service.poller.close()
