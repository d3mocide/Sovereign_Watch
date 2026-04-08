"""
Unit tests for AISSourceConfig health-tracking (sources/base.py).
"""

import time
from sources.base import AISSourceConfig


def _make_source(name: str = "test") -> AISSourceConfig:
    return AISSourceConfig(name=name)


class TestIsHealthy:
    def test_new_source_is_healthy(self):
        assert _make_source().is_healthy()

    def test_penalized_source_is_not_healthy(self):
        src = _make_source()
        src.penalize()
        assert not src.is_healthy()

    def test_reset_restores_healthy(self):
        src = _make_source()
        src.penalize()
        src.cooldown_until = 0.0  # simulate cooldown expired
        assert src.is_healthy()


class TestPenalize:
    def test_sets_cooldown(self):
        src = _make_source()
        before = time.time()
        src.penalize()
        # cooldown_until should be roughly 30 s in the future
        assert src.cooldown_until > before + 25

    def test_doubles_step_on_successive_failures(self):
        src = _make_source()
        src.penalize()
        first_step = src._cooldown_step
        # penalize again while still in cooldown window
        src.penalize()
        assert src._cooldown_step == first_step * 2

    def test_caps_step_at_300s(self):
        src = _make_source()
        # Force many consecutive penalties
        for _ in range(20):
            src.penalize()
        assert src._cooldown_step == 300.0

    def test_resets_step_after_cooldown_expires(self):
        src = _make_source()
        src.penalize()
        src._cooldown_step = 120.0
        # Simulate cooldown already expired
        src.cooldown_until = time.time() - 1
        src.penalize()
        # First penalty after expiry resets step to 30 s
        assert src._cooldown_step == 30.0


class TestResetCooldown:
    def test_clears_cooldown_until(self):
        src = _make_source()
        src.penalize()
        assert not src.is_healthy()
        src.reset_cooldown()
        assert src.cooldown_until == 0.0
        assert src.is_healthy()

    def test_resets_step(self):
        src = _make_source()
        src.penalize()
        src.penalize()  # step = 60 s
        src.reset_cooldown()
        assert src._cooldown_step == 30.0

    def test_idempotent_on_healthy_source(self):
        src = _make_source()
        src.reset_cooldown()  # no-op on already-healthy source
        assert src.is_healthy()
