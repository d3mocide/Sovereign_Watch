import asyncio
import signal
from service import GDELTPulseService

async def main():
    service = GDELTPulseService()
    loop = asyncio.get_running_loop()

    # Graceful Shutdown
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: loop.create_task(service.shutdown()))
    
    try:
        await service.setup()
        
        # Periodic poll for GDELT zip files
        await service.poll_loop()
    
    except asyncio.CancelledError:
        pass
    
    finally:
        await service.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
