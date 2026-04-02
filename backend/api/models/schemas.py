from pydantic import BaseModel, Field
from typing import Optional

class AIModelRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_id: str = Field(..., description="LiteLLM model profile name")

class AnalyzeRequest(BaseModel):
    lookback_hours: int = Field(24, ge=1, le=168, description="Analysis window in hours (max 7 days)")
    mode: str = Field("tactical", description="Analysis persona: tactical, osint, sar")
    sitrep_context: Optional[dict | str] = Field(None, description="Global context for sitrep analysis")

class MissionLocation(BaseModel):
    lat: float
    lon: float
    radius_nm: int
    updated_at: Optional[str] = None

class WatchlistAddRequest(BaseModel):
    icao24: str = Field(..., description="ICAO24 hex code (exactly 6 hex chars, e.g. 'a1b2c3')")
    ttl_days: Optional[float] = Field(None, description="TTL in days; omit or null for permanent")


class H3RiskCell(BaseModel):
    cell: str
    lat: float
    lon: float
    density: float
    sentiment: float
    risk_score: float


class H3RiskResponse(BaseModel):
    cells: list[H3RiskCell]
    resolution: int
    generated_at: str
