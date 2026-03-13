import asyncio
import time
import sys
import os

# Add the parent directory to the path so we can import service
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from service import OrbitalPulseService

max_delay = 0

async def measure_loop_delay():
    global max_delay
    try:
        while True:
            loop_start = time.time()
            await asyncio.sleep(0.001)
            actual_sleep = time.time() - loop_start

            # The delay is how much longer it took to return to our task than expected
            delay = actual_sleep - 0.001

            if delay > max_delay:
                max_delay = delay
    except asyncio.CancelledError:
        pass

async def main():
    service = OrbitalPulseService()

    # Let's add the 'active' group temporarily to simulate the heavy payload (~14k records)
    service.groups.append(("gp.php", "active"))

    start_time = time.time()

    measure_task = asyncio.create_task(measure_loop_delay())

    # Start tasks in loop so measure task can start checking
    await asyncio.sleep(0.01)
    await service.fetch_tle_data()

    end_time = time.time()
    measure_task.cancel()

    print(f"\n--- Benchmark Results ---")
    print(f"Total satellites loaded: {len(service.satrecs)}")
    print(f"Total time taken: {end_time - start_time - 0.01:.4f} seconds")
    print(f"Max event loop delay during fetch_tle_data: {max_delay:.4f} seconds")

if __name__ == "__main__":
    asyncio.run(main())
