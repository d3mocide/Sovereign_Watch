"""
Spatial-Temporal Alignment Engine: Maps and aligns clausal chains across spatial-temporal domains.
Converts GDELT regional events to H3 parent cells and TAK tracks to child cells for fusion.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import h3

logger = logging.getLogger(__name__)


@dataclass
class AlignedClause:
    """Aligned medial clause with spatial and temporal context."""

    time: datetime
    uid: str
    source: str  # 'TAK_ADSB', 'TAK_AIS', 'GDELT'
    predicate_type: str
    lat: float
    lon: float
    narrative: Optional[str]
    h3_cell_micro: Optional[str]  # H3-9 for TAK
    h3_cell_macro: Optional[str]  # H3-7 for GDELT/regional
    adverbial_context: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AlignedClauses:
    """Collection of aligned clauses for a region."""

    h3_region: str  # H3-7 parent cell
    timeframe: str  # '24h', '7d', '30d'
    gdelt_clauses: List[AlignedClause]
    tak_clauses: List[AlignedClause]
    alignment_score: float  # 0.0 - 1.0


class SpatialTemporalAlignment:
    """Aligns GDELT macro-level events with TAK micro-level tactical data."""

    H3_RES_MICRO = 9  # TAK tactical resolution
    H3_RES_MACRO = 7  # GDELT/regional resolution
    LOOKBACK_WINDOWS = {
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }

    def __init__(self):
        pass

    async def align_clauses(
        self,
        h3_region: str,
        clausal_chains: List[Dict],
        gdelt_events: List[Dict],
        lookback_window: str = "24h",
    ) -> AlignedClauses:
        """
        Align clausal chains from both TAK and GDELT sources.

        Args:
            h3_region: H3-7 hexagonal cell for regional grouping
            clausal_chains: List of medial clauses from database
            gdelt_events: List of GDELT events
            lookback_window: Temporal window ('24h', '7d', '30d')

        Returns:
            AlignedClauses object with grouped and spatially-mapped clauses
        """
        if lookback_window not in self.LOOKBACK_WINDOWS:
            lookback_window = "24h"

        window_delta = self.LOOKBACK_WINDOWS[lookback_window]
        cutoff_time = datetime.now(timezone.utc) - window_delta

        # Filter and map GDELT events to parent H3 cell
        gdelt_clauses = []
        for event in gdelt_events:
            if not event.get("event_date"):
                continue

            event_time = self._parse_event_time(event.get("event_date"))
            if event_time < cutoff_time:
                continue

            # Map GDELT location to H3-7 parent cell
            lat = event.get("event_latitude")
            lon = event.get("event_longitude")
            if lat is None or lon is None:
                continue

            h3_macro = h3.latlng_to_cell(lat, lon, self.H3_RES_MACRO)

            # Filter to events in or adjacent to target region
            if not self._cells_proximate(h3_macro, h3_region):
                continue

            clause = AlignedClause(
                time=event_time,
                uid=f"gdelt-{event.get('event_id_cnty', 'unknown')}",
                source="GDELT",
                predicate_type=event.get("event_code", ""),  # CAMEO code
                lat=lat,
                lon=lon,
                narrative=event.get("event_text", ""),
                h3_cell_micro=None,
                h3_cell_macro=h3_macro,
            )
            gdelt_clauses.append(clause)

        # Filter and map TAK clauses to child H3 cells
        tak_clauses = []
        for clause_dict in clausal_chains:
            clause_time = self._parse_clause_time(clause_dict.get("time"))
            if clause_time < cutoff_time:
                continue

            # Check if TAK trace falls within region
            lat = clause_dict.get("locative_lat")
            lon = clause_dict.get("locative_lon")
            if lat is None or lon is None:
                continue

            h3_micro = h3.latlng_to_cell(lat, lon, self.H3_RES_MICRO)
            h3_macro = h3.cell_to_parent(h3_micro, self.H3_RES_MACRO)

            if h3_macro != h3_region:
                continue  # Skip traces outside region

            raw_ctx = clause_dict.get("adverbial_context")
            adverbial_context: Dict[str, Any] = dict(raw_ctx) if raw_ctx else {}

            clause = AlignedClause(
                time=clause_time,
                uid=clause_dict.get("uid", ""),
                source=clause_dict.get("source", "TAK_UNKNOWN"),
                predicate_type=clause_dict.get("predicate_type", ""),
                lat=lat,
                lon=lon,
                narrative=clause_dict.get("narrative_summary"),
                h3_cell_micro=h3_micro,
                h3_cell_macro=h3_macro,
                adverbial_context=adverbial_context,
            )
            tak_clauses.append(clause)

        # Calculate alignment score (overlap in time/space)
        alignment_score = self._calculate_alignment_score(gdelt_clauses, tak_clauses)

        return AlignedClauses(
            h3_region=h3_region,
            timeframe=lookback_window,
            gdelt_clauses=gdelt_clauses,
            tak_clauses=tak_clauses,
            alignment_score=alignment_score,
        )

    def _parse_event_time(self, event_date_str: str) -> datetime:
        """Parse GDELT event date (YYYYMMDD format) to datetime."""
        try:
            dt = datetime.strptime(event_date_str, "%Y%m%d")
            return dt.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return datetime.now(timezone.utc)

    def _parse_clause_time(self, time_val) -> datetime:
        """Parse timestamp from clausal_chains table.

        Accepts either a ``datetime`` object (returned by asyncpg DB queries)
        or an ISO 8601 string.  Returns a timezone-aware UTC datetime; falls
        back to ``datetime.now(UTC)`` only when parsing fails completely.
        """
        try:
            if isinstance(time_val, datetime):
                # asyncpg returns timezone-aware datetimes; ensure UTC.
                if time_val.tzinfo is None:
                    return time_val.replace(tzinfo=timezone.utc)
                return time_val
            iso_time_str = str(time_val)
            # Handle ISO format with or without timezone
            if iso_time_str.endswith("Z"):
                iso_time_str = iso_time_str[:-1] + "+00:00"
            return datetime.fromisoformat(iso_time_str)
        except (ValueError, TypeError, AttributeError):
            return datetime.now(timezone.utc)

    def _cells_proximate(self, cell1: str, cell2: str, max_distance: int = 1) -> bool:
        """Check if two H3 cells are within max_distance steps (include same cell)."""
        try:
            if cell1 == cell2:
                return True
            # Get parent to check adjacency
            parent1 = h3.cell_to_parent(cell1, self.H3_RES_MACRO - 1)
            parent2 = h3.cell_to_parent(cell2, self.H3_RES_MACRO - 1)
            return parent1 == parent2
        except Exception:
            return False

    def _calculate_alignment_score(
        self, gdelt_clauses: List[AlignedClause], tak_clauses: List[AlignedClause]
    ) -> float:
        """
        Score alignment between GDELT and TAK events.
        Higher score = stronger temporal/spatial overlap.
        """
        if not gdelt_clauses or not tak_clauses:
            return 0.0

        # Simple scoring: count temporal overlaps
        overlap_count = 0
        max_time_delta = timedelta(hours=2)  # Events within 2 hours count as overlapping

        for gdelt in gdelt_clauses:
            for tak in tak_clauses:
                if abs((gdelt.time - tak.time)) < max_time_delta:
                    overlap_count += 1

        # Normalize: max possible is len(gdelt) * len(tak)
        max_overlaps = max(len(gdelt_clauses) * len(tak_clauses), 1)
        score = min(overlap_count / max_overlaps, 1.0)

        return score

    def h3_parent_map(self, gdelt_events: List[Dict]) -> Dict[str, List[Dict]]:
        """Map GDELT events to H3-7 parent cells."""
        result = {}
        for event in gdelt_events:
            lat = event.get("event_latitude")
            lon = event.get("event_longitude")
            if lat is None or lon is None:
                continue

            try:
                h3_cell = h3.latlng_to_cell(lat, lon, self.H3_RES_MACRO)
                if h3_cell not in result:
                    result[h3_cell] = []
                result[h3_cell].append(event)
            except Exception as e:
                logger.warning(f"Error mapping GDELT event to H3: {e}")

        return result

    def h3_child_clusters(self, clauses: List[Dict]) -> Dict[str, List[Dict]]:
        """Cluster TAK clauses by H3-9 child cells within regions."""
        result = {}
        for clause in clauses:
            lat = clause.get("locative_lat")
            lon = clause.get("locative_lon")
            if lat is None or lon is None:
                continue

            try:
                h3_cell = h3.latlng_to_cell(lat, lon, self.H3_RES_MICRO)
                if h3_cell not in result:
                    result[h3_cell] = []
                result[h3_cell].append(clause)
            except Exception as e:
                logger.warning(f"Error mapping TAK clause to H3: {e}")

        return result
