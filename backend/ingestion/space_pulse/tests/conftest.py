"""Use the same authoritative TAK schema that Compose mounts into /app/proto."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "api"))
