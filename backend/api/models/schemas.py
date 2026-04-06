from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional


class AIModelRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_id: str = Field(..., description="LiteLLM model profile name")


class AnalyzeRequest(BaseModel):
    lookback_hours: int = Field(
        24, ge=1, le=168, description="Analysis window in hours (max 7 days)"
    )
    mode: str = Field("tactical", description="Analysis persona: tactical, osint, sar")
    sitrep_context: Optional[dict | str] = Field(
        None, description="Global context for sitrep analysis"
    )


class MissionLocation(BaseModel):
    lat: float
    lon: float
    radius_nm: int
    updated_at: Optional[str] = None


class WatchlistAddRequest(BaseModel):
    icao24: str = Field(..., description="ICAO24 hex code (exactly 6 hex chars, e.g. 'a1b2c3')")
    ttl_days: Optional[float] = Field(None, description="TTL in days; omit or null for permanent")


class RiskSeverity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


# Per-domain score thresholds: [low_max, medium_max, high_max]
# Scores at or above high_max are CRITICAL.
SEVERITY_THRESHOLDS: dict[str, list[float]] = {
    "default":        [0.25, 0.55, 0.80],
    "maritime":       [0.20, 0.45, 0.70],  # tighter — sea-state is noisy
    "aviation":       [0.25, 0.55, 0.80],
    "orbital":        [0.30, 0.60, 0.85],  # looser — space-weather spikes expected
    "rf":             [0.25, 0.55, 0.80],
    "infrastructure": [0.25, 0.55, 0.80],
}


def score_to_severity(score: float, domain: str = "default") -> RiskSeverity:
    """Map a normalised [0, 1] risk score to a severity label for the given domain."""
    lo, mid, hi = SEVERITY_THRESHOLDS.get(domain, SEVERITY_THRESHOLDS["default"])
    if score < lo:
        return RiskSeverity.LOW
    if score < mid:
        return RiskSeverity.MEDIUM
    if score < hi:
        return RiskSeverity.HIGH
    return RiskSeverity.CRITICAL


class H3RiskCell(BaseModel):
    cell: str
    lat: float
    lon: float
    density: float
    sentiment: float
    risk_score: float
    severity: RiskSeverity = RiskSeverity.LOW


class H3RiskResponse(BaseModel):
    cells: list[H3RiskCell]
    resolution: int
    generated_at: str
