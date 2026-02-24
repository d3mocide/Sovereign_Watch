import asyncio
import logging
from service import OrbitalPulseService

logger = logging.getLogger("orbital_pulse")

async def main():
    service = OrbitalPulseService()
    try:
        await service.setup()
        await asyncio.gather(
            service.tle_update_loop(),
            service.propagation_loop()
        )
    except KeyboardInterrupt:
        logger.info("Interrupted")
    finally:
        await service.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
