import asyncio
import signal
from service import MaritimePollerService

async def main():
    service = MaritimePollerService()
    loop = asyncio.get_running_loop()

    # Graceful Shutdown
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(service.shutdown()))
    
    try:
        await service.setup()
        
        # Run both the streaming loop and navigation listener concurrently
        await asyncio.gather(
            service.stream_loop(),
            service.navigation_listener(),
            service.cleanup_cache()
        )
    
    except asyncio.CancelledError:
        pass
    
    finally:
        await service.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
