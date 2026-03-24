import sys
sys.path.append('js8call')
import asyncio
import logging
from kiwi_directory import KiwiDirectory

logging.basicConfig(level=logging.DEBUG)

async def main():
    d = KiwiDirectory()
    print('fetching...')
    await d.refresh()
    print('count:', d.node_count)
    print('samples:', d.get_nodes(14074, 0, 0, limit=2))

if __name__ == '__main__':
    asyncio.run(main())
