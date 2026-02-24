import asyncio
from service import MaritimePollerService

async def main():
    service = MaritimePollerService()
    
    try:
        await service.setup()
        
        # Run both the streaming loop and navigation listener concurrently
        await asyncio.gather(
            service.stream_loop(),
            service.navigation_listener(),
            service.cleanup_cache()
        )
    
    except KeyboardInterrupt:
        pass
    
    finally:
        await service.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
