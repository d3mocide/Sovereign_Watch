"""
AIS source health-tracking dataclass.

Mirrors the AviationSource cooldown pattern from aviation_poller/multi_source_poller.py
so per-source exponential backoff is consistent across all pollers.
"""

import logging
import time
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class AISSourceConfig:
    name: str
    enabled: bool = True
    # Wall-clock timestamp until which this source is penalised (in cooldown).
    cooldown_until: float = field(default=0.0)
    # Current cooldown step duration; doubles on each successive failure, capped at 300 s.
    _cooldown_step: float = field(default=30.0)

    def is_healthy(self) -> bool:
        """Return True if this source is not currently in a cooldown window."""
        return time.time() >= self.cooldown_until

    def penalize(self) -> None:
        """
        Apply exponential backoff after a connection failure or data timeout.
        Starts at 30 s, doubles on each successive failure, caps at 5 minutes.
        If the cooldown already expired before the next failure the step resets to 30 s.
        """
        now = time.time()
        if now < self.cooldown_until:
            # Still inside an existing cooldown — escalate
            self._cooldown_step = min(self._cooldown_step * 2, 300.0)
        else:
            # Previous cooldown expired — start fresh
            self._cooldown_step = 30.0
        self.cooldown_until = now + self._cooldown_step
        logger.warning(
            "%s penalized — cooling down for %.0fs (until %s)",
            self.name,
            self._cooldown_step,
            time.strftime("%H:%M:%S", time.localtime(self.cooldown_until)),
        )

    def reset_cooldown(self) -> None:
        """Clear cooldown state after a successful connection + data received."""
        if self.cooldown_until > 0.0:
            logger.info("%s recovered — cooldown cleared", self.name)
        self.cooldown_until = 0.0
        self._cooldown_step = 30.0
