import asyncio
import websockets
import time
import logging

logging.basicConfig(level=logging.INFO)

async def test():
    uri = f"ws://kiwisdr.wb7awl.us:8073/{int(time.time() * 1000)}/SND"
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as ws:
            print("Connected. Sending handshake...")
            await ws.send("SET auth t=kiwi p=")
            await ws.send("SET mod=usb low_cut=-3000 high_cut=3000")
            await ws.send("SET freq=14074.000")
            await ws.send("SET compression=0")
            await ws.send("SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=50")
            await ws.send("SET AR OK in=12000 out=44100")
            print("Waiting for frames...")
            for i in range(5):
                frame = await asyncio.wait_for(ws.recv(), timeout=2.0)
                print(f"Received frame {i}: type={type(frame)}, len={len(frame)}")
                if isinstance(frame, bytes):
                    print("Header:", frame[:10])
                else:
                    print("Text:", frame[:50])
    except Exception as exc:
        print(f"Error: {exc}")

asyncio.run(test())
