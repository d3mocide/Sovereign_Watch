"""
TAK Clausalizer Main Entry Point

Usage:
    python -u main.py
"""

import asyncio
import logging
import signal

from service import TakClausalizerService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("main")


async def main():
    """Main entry point."""
    service = TakClausalizerService()

    # Setup graceful shutdown handlers
    loop = asyncio.get_running_loop()

    def handle_signal():
        logger.info("Signal received, initiating shutdown...")
        asyncio.create_task(service.shutdown())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, handle_signal)

    try:
        # Setup and run
        await service.setup()
        await service.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        raise
    finally:
        # Ensure shutdown is called
        await service.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
