"""Background system sampling; Kafka connections live for the sampler lifetime."""
import asyncio
import json
import logging

import psutil
from aiokafka import AIOKafkaConsumer
from aiokafka.admin import AIOKafkaAdminClient

from core.config import settings
from core.database import db

logger = logging.getLogger("SovereignWatch.Metrics")
CACHE_KEY = "metrics:system:snapshot"
INTERVAL = 5
CACHE_TTL = 15


def sample_host() -> dict:
    payload: dict = {}

    # --- psutil: CPU ---
    try:
        payload["cpu_percent"] = psutil.cpu_percent(interval=0.2)
        payload["cpu_per_core"] = psutil.cpu_percent(percpu=True, interval=0)
    except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
        logger.warning("psutil CPU error: %s", exc)
        payload["cpu_percent"] = None
        payload["cpu_per_core"] = []

    # --- psutil: Memory ---
    try:
        vm = psutil.virtual_memory()
        payload["memory"] = {
            "total_gb": round(vm.total / 1024**3, 1),
            "used_gb": round(vm.used / 1024**3, 1),
            "percent": vm.percent,
        }
    except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
        logger.warning("psutil memory error: %s", exc)
        payload["memory"] = None

    # --- psutil: Disk ---
    try:
        du = psutil.disk_usage("/")
        payload["disk"] = {
            "total_gb": round(du.total / 1024**3, 1),
            "used_gb": round(du.used / 1024**3, 1),
            "percent": du.percent,
        }
    except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
        logger.warning("psutil disk error: %s", exc)
        payload["disk"] = None

    # --- psutil: Disk I/O ---
    try:
        dio = psutil.disk_io_counters()
        if dio:
            payload["disk_io"] = {
                "read_mb": round(dio.read_bytes / 1024**2, 1),
                "write_mb": round(dio.write_bytes / 1024**2, 1),
            }
        else:
            payload["disk_io"] = None
    except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
        logger.warning("psutil disk_io error: %s", exc)
        payload["disk_io"] = None

    # --- psutil: Network I/O ---
    try:
        nio = psutil.net_io_counters()
        payload["net_io"] = {
            "sent_mb": round(nio.bytes_sent / 1024**2, 1),
            "recv_mb": round(nio.bytes_recv / 1024**2, 1),
        }
    except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
        logger.warning("psutil net_io error: %s", exc)
        payload["net_io"] = None

    # --- psutil: Temperatures ---
    try:
        temps_raw = psutil.sensors_temperatures()
        if temps_raw:
            payload["temperatures"] = {
                sensor: [round(r.current, 1) for r in readings]
                for sensor, readings in temps_raw.items()
            }
        else:
            payload["temperatures"] = None
    except Exception:  # noqa: BLE001 - optional platform sensor support
        payload["temperatures"] = None

    return payload


class SystemMetricsSampler:
    def __init__(self):
        self.task = None
        self.admin = None
        self.consumer = None
        self.lock = asyncio.Lock()

    async def start(self):
        if self.task is None:
            self.task = asyncio.create_task(self._run())

    async def stop(self):
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
        await self._close_clients()

    async def _close_clients(self):
        consumer, admin = self.consumer, self.admin
        self.consumer = self.admin = None
        try:
            if consumer:
                await consumer.stop()
        finally:
            if admin:
                await admin.close()

    async def _lag(self):
        try:
            return await asyncio.wait_for(self._read_lag(), timeout=3)
        except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
            logger.warning("Kafka lag sampling error: %s", exc)
            await self._close_clients()
            return None

    async def _read_lag(self):
        if self.admin is None:
            self.admin = AIOKafkaAdminClient(bootstrap_servers=settings.KAFKA_BROKERS)
            await self.admin.start()
        if self.consumer is None:
            self.consumer = AIOKafkaConsumer(
                bootstrap_servers=settings.KAFKA_BROKERS, enable_auto_commit=False,
            )
            await self.consumer.start()
        committed = await self.admin.list_consumer_group_offsets("historian-writer-v2")
        if not committed:
            return {"historian-writer-v2": {"total_lag": 0, "severity": "ok", "topics": {}}}
        end_offsets = await self.consumer.end_offsets(list(committed))
        topics: dict[str, int] = {}
        for tp, meta in committed.items():
            c_offset = meta.offset if meta is not None else 0
            e_offset = end_offsets.get(tp, c_offset)
            lag = max(0, e_offset - c_offset)
            topics[tp.topic] = topics.get(tp.topic, 0) + lag

        total_lag = sum(topics.values())
        severity = (
            "ok"
            if total_lag < 500
            else ("amber" if total_lag < 5_000 else "red")
        )
        return {
            "historian-writer-v2": {"total_lag": total_lag, "severity": severity, "topics": topics}
        }


    async def collect(self):
        # Serve a warm snapshot even while the next sample is being collected.
        cached = await db.redis_client.get(CACHE_KEY)
        if cached:
            return json.loads(cached)
        # Single-flight cold start; the route and background task share a sample.
        async with self.lock:
            cached = await db.redis_client.get(CACHE_KEY)
            if cached:
                return json.loads(cached)
            return await self._sample()

    async def _sample(self):
        payload = await asyncio.to_thread(sample_host)
        try:
            info = await db.redis_client.info()
            hits = info.get("keyspace_hits", 0)
            misses = info.get("keyspace_misses", 0)
            payload["redis"] = {
                "used_memory_mb": round(info.get("used_memory", 0) / 1024**2, 1),
                "connected_clients": info.get("connected_clients", 0),
                "hit_rate_pct": round(hits / (hits + misses) * 100, 1) if hits + misses else 0,
                "evicted_keys": info.get("evicted_keys", 0),
            }
        except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
            logger.warning("Redis sampling error: %s", exc)
            payload["redis"] = None
        payload["kafka_lag"] = await self._lag()
        await db.redis_client.setex(CACHE_KEY, CACHE_TTL, json.dumps(payload))
        return payload

    async def _run(self):
        while True:
            try:
                async with self.lock:
                    await self._sample()
            except Exception as exc:  # noqa: BLE001 - monitoring isolates unavailable subsystems
                logger.warning("System sampling error: %s", exc)
            await asyncio.sleep(INTERVAL)


system_metrics = SystemMetricsSampler()
