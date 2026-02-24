import asyncio
import signal
from service import PollerService

if __name__ == "__main__":
    service = PollerService()

    # Graceful Shutdown
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(service.shutdown()))

    loop.run_until_complete(service.setup())
    try:
        # Run both the polling loop and the navigation listener concurrently
        loop.run_until_complete(asyncio.gather(
            service.loop(),
            service.navigation_listener()
        ))
    except asyncio.CancelledError:
        pass
    finally:
        loop.run_until_complete(service.shutdown())
