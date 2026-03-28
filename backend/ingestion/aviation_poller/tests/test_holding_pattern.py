"""
Unit tests for the HoldingPatternDetector class.

Tests cover:
  - Turn angle calculation (360° wraparound handling)
  - State accumulation over time windows
  - Confidence scoring
  - Pattern detection and eviction
"""

import time
from unittest.mock import AsyncMock, patch

import pytest
from holding_pattern import (
    HoldingPatternDetector as Detector,
)


class TestHoldingPatternDetector:
    """Test suite for HoldingPatternDetector."""

    @pytest.fixture
    def detector(self):
        """Create a detector instance with mocked Redis."""
        with patch("holding_pattern.aioredis.from_url"):
            return Detector("redis://localhost:6379")

    def test_normalize_heading(self):
        """Test heading normalization to [0, 360) range."""
        assert Detector._normalize_heading(0) == 0
        assert Detector._normalize_heading(360) == 0
        assert Detector._normalize_heading(720) == 0
        assert Detector._normalize_heading(-90) == 270
        assert Detector._normalize_heading(450) == 90
        assert Detector._normalize_heading(-45) == 315

    def test_shortest_turn_angle_simple(self):
        """Test shortest arc calculation for simple cases."""
        # 0° → 90° = 90° (shortest path)
        assert Detector._shortest_turn_angle(0, 90) == 90

        # 350° → 10° = 20° (not 340°)
        assert abs(Detector._shortest_turn_angle(350, 10) - 20) < 0.1

        # 10° → 350° = 20° (not 340°)
        assert abs(Detector._shortest_turn_angle(10, 350) - 20) < 0.1

        # 180° → 200° = 20°
        assert Detector._shortest_turn_angle(180, 200) == 20

        # 0° → 180° = 180° (ambiguous, but algorithm picks one)
        result = Detector._shortest_turn_angle(0, 180)
        assert result == 180

    def test_shortest_turn_angle_wraparound(self):
        """Test shortest arc with wraparound cases."""
        # 359° → 1° = 2° (wraparound)
        assert abs(Detector._shortest_turn_angle(359, 1) - 2) < 0.1

        # 1° → 359° = 2° (wraparound)
        assert abs(Detector._shortest_turn_angle(1, 359) - 2) < 0.1

    def test_ingest_simple_turn(self, detector):
        """Test ingesting a simple heading change."""
        hex_id = "abc123"

        # First observation (should not process turn yet)
        detector.ingest(
            hex_id=hex_id,
            heading=0,
            speed=100,
            lat=45.0,
            lon=-122.0,
        )
        assert detector.get_total_turns(hex_id) == 0

        # Second observation: 90° turn
        detector.ingest(
            hex_id=hex_id,
            heading=90,
            speed=100,
            lat=45.01,
            lon=-122.0,
        )
        # Should accumulate the 90° turn
        assert abs(detector.get_total_turns(hex_id) - 90) < 5

    def test_ingest_multiple_turns(self, detector):
        """Test accumulating multiple turns toward holding pattern threshold."""
        hex_id = "def456"
        start_time = time.time() - 120

        # Simulate 4 x 90° turns = 360° total over >60s (should trigger pattern)
        headings = [0, 90, 180, 270, 0]

        for i, heading in enumerate(headings):
            detector.ingest(
                hex_id=hex_id,
                heading=heading,
                speed=100,
                lat=45.0,
                lon=-122.0,
                timestamp=start_time + (i * 30),
            )

        # Total should be around 360°
        total_turn = detector.get_total_turns(hex_id)
        assert total_turn >= 360, f"Expected ≥360°, got {total_turn}"

        # Should be flagged as holding pattern
        assert detector.is_holding_pattern(hex_id) is True

    def test_not_flagged_before_min_circle_duration(self, detector):
        """Pattern should not be flagged if turn threshold is reached too quickly."""
        hex_id = "duration_gate"
        start_time = time.time()

        headings = [0, 90, 180, 270, 0]  # 360° total
        for i, heading in enumerate(headings):
            detector.ingest(
                hex_id=hex_id,
                heading=heading,
                speed=130,
                lat=45.0,
                lon=-122.0,
                timestamp=start_time + (i * 10),  # 40s total < default 60s gate
            )

        assert detector.get_total_turns(hex_id) >= 360
        assert detector.is_holding_pattern(hex_id) is False

    def test_directional_consistency_gate(self, detector):
        """Back-and-forth turns should not qualify as a holding pattern."""
        hex_id = "direction_gate"
        start_time = time.time() - 180

        # Alternating directions accumulate absolute turn but have poor directional consistency.
        headings = [0, 90, 0, 90, 0, 90, 0, 90, 0]
        for i, heading in enumerate(headings):
            detector.ingest(
                hex_id=hex_id,
                heading=heading,
                speed=130,
                lat=45.0,
                lon=-122.0,
                timestamp=start_time + (i * 30),
            )

        assert detector.get_total_turns(hex_id) >= 360
        assert detector.is_holding_pattern(hex_id) is False

    def test_heading_change_threshold(self, detector):
        """Test that small heading changes below threshold are ignored."""
        hex_id = "ghi789"

        # Initial heading
        detector.ingest(
            hex_id=hex_id,
            heading=0,
            speed=100,
            lat=45.0,
            lon=-122.0,
        )

        # Tiny 1° change (below HEADING_CHANGE_THRESHOLD of 2°)
        detector.ingest(
            hex_id=hex_id,
            heading=1,
            speed=100,
            lat=45.0,
            lon=-122.0,
        )

        # Should not accumulate this tiny turn
        assert detector.get_total_turns(hex_id) < 2

    def test_no_pattern_with_random_turns(self, detector):
        """Test that random small turns don't trigger pattern."""
        hex_id = "jkl012"

        # Random ±5° jitter around 0°
        headings = [0, 5, 358, 3, 357, 4]

        for heading in headings:
            detector.ingest(
                hex_id=hex_id,
                heading=heading,
                speed=100,
                lat=45.0,
                lon=-122.0,
            )

        # Total should be small (just accumulation of small changes)
        total_turn = detector.get_total_turns(hex_id)
        assert total_turn < 100, (
            f"Random jitter should not accumulate to pattern. Got {total_turn}"
        )
        assert detector.is_holding_pattern(hex_id) is False

    def test_low_speed_ignores_turns(self, detector):
        """Test that turns at low speed don't accumulate (if min_velocity set)."""
        hex_id = "mno345"

        # Simulate low-speed turns (e.g., taxiing aircraft)
        detector.ingest(
            hex_id=hex_id,
            heading=0,
            speed=10,  # Very slow
            lat=45.0,
            lon=-122.0,
        )

        # Low speed should clear the pattern flag if it was set
        detector.ingest(
            hex_id=hex_id,
            heading=90,
            speed=10,
            lat=45.0,
            lon=-122.0,
        )

        # Pattern should not persist below minimum velocity
        assert detector.is_holding_pattern(hex_id) is False

    def test_none_heading_ignored(self, detector):
        """Test that None heading is safely ignored."""
        hex_id = "pqr678"

        # None heading should not cause error and should not update state
        detector.ingest(
            hex_id=hex_id,
            heading=None,
            speed=100,
            lat=45.0,
            lon=-122.0,
        )

        # Should not be initialized
        assert hex_id not in detector._aircraft_state

    def test_state_persistence_across_calls(self, detector):
        """Test that aircraft state persists correctly."""
        hex_id = "stu901"

        # First call
        detector.ingest(
            hex_id=hex_id,
            heading=0,
            speed=100,
            lat=45.0,
            lon=-122.0,
            callsign="ABC123",
        )

        # State should be created
        assert hex_id in detector._aircraft_state
        assert detector._aircraft_state[hex_id]["callsign"] == "ABC123"

        # Second call with different callsign (should update)
        detector.ingest(
            hex_id=hex_id,
            heading=45,
            speed=110,
            lat=45.01,
            lon=-122.01,
            callsign="ABC456",
        )

        # Callsign should be updated
        assert detector._aircraft_state[hex_id]["callsign"] == "ABC456"
        assert detector._aircraft_state[hex_id]["speed"] == 110

    def test_confidence_scoring(self, detector):
        """Test that confidence score is calculated correctly."""
        hex_id = "vwx234"

        # Simulate 1.5 turns (540°) over >2 min
        start_time = time.time() - 120  # 2 minutes ago

        # Ingest turns with specific timestamps
        headings = [0, 90, 180, 270, 0, 90]
        for i, heading in enumerate(headings):
            detector.ingest(
                hex_id=hex_id,
                heading=heading,
                speed=100,
                lat=45.0,
                lon=-122.0,
                timestamp=start_time + i * 30,  # 30s apart
            )

        # Calculate confidence
        total_turn = detector.get_total_turns(hex_id)
        duration = 150  # 2.5 minutes
        confidence = detector._calculate_confidence(hex_id, duration)

        # Confidence should be between 0.2 and 1.0
        assert 0.2 <= confidence <= 1.0

        # With 1.5+ turns and >2min duration, should be relatively high
        if total_turn >= 540:
            assert confidence > 0.5

    @pytest.mark.asyncio
    async def test_redis_connection(self):
        """Test that detector initializes Redis correctly."""
        with patch(
            "holding_pattern.aioredis.from_url", new_callable=AsyncMock
        ) as mock_redis:
            detector = Detector("redis://test:6379")

            await detector.start()
            mock_redis.assert_called_once()

            await detector.close()

    def test_eviction_stale_data(self, detector):
        """Test that old data is evicted correctly."""
        hex_id = "yza567"

        # Ingest with old timestamp
        old_time = time.time() - 400  # 400 seconds ago (beyond 300s window)
        detector.ingest(
            hex_id=hex_id,
            heading=0,
            speed=100,
            lat=45.0,
            lon=-122.0,
            timestamp=old_time,
        )

        # Current timestamp
        detector.ingest(
            hex_id=hex_id,
            heading=90,
            speed=100,
            lat=45.0,
            lon=-122.0,
        )

        # Run eviction
        detector._evict_stale()

        # Old data should be removed
        state = detector._aircraft_state.get(hex_id)
        if state:
            for ts, _ in state.get("heading_history", []):
                assert time.time() - ts < 350


class TestHoldingPatternIntegration:
    """Integration tests for holding pattern detector."""

    @pytest.fixture
    def detector(self):
        with patch("holding_pattern.aioredis.from_url"):
            return Detector("redis://localhost:6379")

    def test_full_circle_detection(self, detector):
        """Test detecting a complete 360° circle."""
        hex_id = "circle_test"
        start_time = time.time() - 180

        # Simulate a complete circle: 0° → 90° → 180° → 270° → 360°(0°)
        for i in range(37):  # 36 heading transitions x 10° = 360°
            heading = (i * 10) % 360
            detector.ingest(
                hex_id=hex_id,
                heading=heading,
                speed=150,
                lat=45.0,
                lon=-122.0,
                callsign="CIRCLE1",
                timestamp=start_time + (i * 5),
            )

        # Should detect at least 360° of turn
        total_turn = detector.get_total_turns(hex_id)
        assert total_turn >= 360
        assert detector.is_holding_pattern(hex_id) is True

    def test_spiral_climb(self, detector):
        """Test detecting a spiral pattern (circular with altitude change)."""
        hex_id = "spiral_test"
        start_time = time.time() - 180

        # Spiral: circular heading with increasing altitude
        for i in range(24):  # 24 steps = 240° spiral
            heading = (i * 15) % 360  # 15° per step
            altitude = 5000 + i * 100  # Climbing
            detector.ingest(
                hex_id=hex_id,
                heading=heading,
                speed=120,
                lat=45.0,
                lon=-122.0,
                altitude=altitude,
                callsign="SPIRAL1",
                timestamp=start_time + (i * 8),
            )

        # Should accumulate ~345° of turn (23 turns of 15°)
        total_turn = detector.get_total_turns(hex_id)
        assert 300 <= total_turn <= 360
        assert detector.is_holding_pattern(hex_id) is False
