"""
Test configuration for the aviation poller.

1. Adds the aviation_poller package directory to sys.path so that bare-module
   imports in service.py / h3_sharding.py resolve from any working directory.

2. Stubs out heavy runtime-only packages (aiokafka, aiolimiter, tenacity,
   uvloop) that are not installed in the host test environment. The stubs are
   placed in sys.modules before any poller module is imported, so they satisfy
   the import without requiring the real C-extensions or broker connections.
"""
import sys
import os
from unittest.mock import MagicMock

# --- 1. Path setup ----------------------------------------------------------
_POLLER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _POLLER_DIR not in sys.path:
    sys.path.insert(0, _POLLER_DIR)

# --- 2. Lightweight stubs for packages not present in the host env ----------

def _stub(name):
    """Insert a MagicMock into sys.modules under *name* and return it."""
    mod = MagicMock(name=name)
    sys.modules.setdefault(name, mod)
    return mod

# aiokafka
aiokafka_stub = _stub("aiokafka")
aiokafka_stub.AIOKafkaProducer = MagicMock

# aiolimiter
aiolimiter_stub = _stub("aiolimiter")
aiolimiter_stub.AsyncLimiter = MagicMock

# tenacity — service.py uses retry / wait_exponential / stop_after_attempt
tenacity_stub = _stub("tenacity")
tenacity_stub.retry = lambda **kw: (lambda f: f)   # no-op decorator
tenacity_stub.wait_exponential = MagicMock(return_value=None)
tenacity_stub.stop_after_attempt = MagicMock(return_value=None)
tenacity_stub.retry_if_exception_type = MagicMock(return_value=None)

# uvloop (optional; only imported on non-Windows at runtime)
_stub("uvloop")
