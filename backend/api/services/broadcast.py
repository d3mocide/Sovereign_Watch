import asyncio
import logging
import json
from typing import Set
from fastapi import WebSocket, WebSocketDisconnect
from aiokafka import AIOKafkaConsumer
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
from uvicorn.protocols.utils import ClientDisconnected

from core.config import settings
from services.tak import transform_to_proto

logger = logging.getLogger("SovereignWatch.Broadcast")

class BroadcastManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.consumer: AIOKafkaConsumer | None = None
        self.consumer_task: asyncio.Task | None = None
        self.running = False

    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket client."""
        # Caller must await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Client connected. Total clients: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket client."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            try:
                # Ensure it's closed (idempotent)
                await websocket.close()
            except Exception:
                pass
            logger.info(f"Client disconnected. Total clients: {len(self.active_connections)}")

    async def start(self):
        """Start the Kafka consumer and broadcast loop."""
        if self.running:
            return

        self.running = True
        # Initialize Kafka Consumer
        # Using group_id=None for broadcast mode (all instances get all messages)
        try:
            self.consumer = AIOKafkaConsumer(
                "adsb_raw", "ais_raw", "orbital_raw",
                bootstrap_servers=settings.KAFKA_BROKERS,
                group_id=None,
                auto_offset_reset="latest"
            )
            await self.consumer.start()
            logger.info("Broadcast Kafka Consumer started")

            self.consumer_task = asyncio.create_task(self._consume())
        except Exception as e:
            logger.error(f"Failed to start Broadcast Consumer: {e}")
            self.running = False

    async def stop(self):
        """Stop the consumer and close all connections."""
        self.running = False

        if self.consumer_task:
            self.consumer_task.cancel()
            try:
                await self.consumer_task
            except asyncio.CancelledError:
                pass
            self.consumer_task = None

        if self.consumer:
            await self.consumer.stop()
            self.consumer = None
            logger.info("Broadcast Kafka Consumer stopped")

        # Close all active connections
        for ws in list(self.active_connections):
            await self.disconnect(ws)

        self.active_connections.clear()

    async def _consume(self):
        """Internal loop to consume from Kafka and broadcast."""
        if not self.consumer:
            logger.error("Consumer not initialized!")
            return

        try:
            async for msg in self.consumer:
                if not self.running:
                    break

                try:
                    # 1. Transform ONCE
                    data = json.loads(msg.value.decode('utf-8'))
                    tak_bytes = transform_to_proto(data)

                    # 2. Broadcast to ALL
                    if not self.active_connections:
                        continue

                    # Use asyncio.gather to broadcast concurrently
                    # Use return_exceptions=True to prevent one failure from stopping others (though _safe_send catches exceptions)
                    tasks = [
                        self._safe_send(ws, tak_bytes)
                        for ws in self.active_connections
                    ]
                    if tasks:
                        await asyncio.gather(*tasks)

                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    continue

        except Exception as e:
            logger.critical(f"Broadcast loop failed: {e}", exc_info=True)
            self.running = False
            # Close connections to force client reconnect
            # We schedule stop() because we can't await it easily here if it cancels this task?
            # Actually stop() cancels this task. If we call stop() from within the task,
            # we cancel ourselves. That's fine.
            # But safer to just let the loop exit and maybe trigger a restart or cleanup.
            # Let's just clear connections.
            for ws in list(self.active_connections):
                try:
                    await ws.close(code=1011) # Internal Error
                except Exception:
                    pass
            self.active_connections.clear()

    async def _safe_send(self, ws: WebSocket, data: bytes):
        """Send data to a client, handling disconnection errors and timeouts."""
        try:
            # Enforce timeout (e.g. 0.5s) to prevent slow clients from stalling the broadcast
            # If a client can't accept a message in 500ms, they are too slow for real-time.
            await asyncio.wait_for(ws.send_bytes(data), timeout=0.5)
        except asyncio.TimeoutError:
            logger.warning("Client slow (timeout), disconnecting.")
            await self.disconnect(ws)
        except (WebSocketDisconnect, ConnectionClosedOK, ConnectionClosedError, ClientDisconnected):
            # Normal disconnection
            await self.disconnect(ws)
        except Exception as e:
            logger.error(f"Error sending to client: {e}")
            await self.disconnect(ws)

# Global Instance
broadcast_service = BroadcastManager()
