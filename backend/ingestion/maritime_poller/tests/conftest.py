"""
Test configuration for the maritime poller.

1. Adds the repository root to sys.path so that the dotted import
   `backend.ingestion.maritime_poller.classification` resolves correctly when
   pytest is run from the poller directory or the repo root.

2. Stubs out heavy runtime-only packages (aiokafka, redis, websockets) that
   are not installed in the host test environment.  The stubs are placed in
   sys.modules before any poller module is imported, so they satisfy imports
   without requiring a running broker or real network connections.
"""
import os
import sys
from unittest.mock import MagicMock

# --- 1. Path setup -----------------------------------------------------------
# Walk up to the repo root (three levels above this file) and insert it so
# that `backend.ingestion.maritime_poller.*` is resolvable as a namespace pkg.
_TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
_POLLER_DIR = os.path.dirname(_TESTS_DIR)
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_POLLER_DIR)))

for _path in (_REPO_ROOT, _POLLER_DIR):
    if _path not in sys.path:
        sys.path.insert(0, _path)


# --- 2. Lightweight stubs for packages not present in the host env -----------

def _stub(name: str) -> MagicMock:
    """Insert a MagicMock into sys.modules under *name* and return it."""
    mod = MagicMock(name=name)
    sys.modules.setdefault(name, mod)
    return mod


# aiokafka — used by service.py
aiokafka_stub = _stub("aiokafka")
aiokafka_stub.AIOKafkaProducer = MagicMock

# redis / redis.asyncio — used by service.py
_stub("redis")
redis_async_stub = _stub("redis.asyncio")
redis_async_stub.Redis = MagicMock

# websockets — used by service.py and sources/aishub.py
_stub("websockets")
_stub("websockets.exceptions")
