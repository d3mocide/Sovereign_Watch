import asyncio
import websockets
import time

async def test():
    uri = f"ws://kiwisdr.wb7awl.us:8073/{int(time.time() * 1000)}/SND"
    print("connecting to", uri)
    try:
        async with websockets.connect(uri):
            print("connected!")
    except Exception as e:
        print("error:", type(e), e)

asyncio.run(test())
