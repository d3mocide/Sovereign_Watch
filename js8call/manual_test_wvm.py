import asyncio
import websockets
import time

async def main():
    uri = f"ws://kiwisdr.wb7awl.us:8073/{int(time.time()*1000)}/W/F"
    print(f"Connecting to {uri}")
    try:
        async with websockets.connect(uri) as ws:
            print("Connected. Sending auth...")
            await ws.send("SET auth t=kiwi p=")
            print("Sending zoom config...")
            await ws.send("SET zoom=0 start=0")
            await ws.send("SET max_freq=30000000")
            await ws.send("SET bins=1024")
            
            print("Listening for frames...")
            for i in range(10):
                frame = await asyncio.wait_for(ws.recv(), timeout=2.0)
                if isinstance(frame, bytes):
                    print(f"Got Binary Frame: length={len(frame)}, prefix={frame[:10]}")
                else:
                    print(f"Got Text Frame: {frame[:100]}")
    except Exception as e:
        import traceback; traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
