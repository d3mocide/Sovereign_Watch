from pydantic import BaseModel, Field
from typing import Optional

class AIModelRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_id: str = Field(..., description="LiteLLM model profile name")

class AnalyzeRequest(BaseModel):
    # Sentinel: Add input validation bounds to prevent DoS via huge queries
    uid: str = Field(..., max_length=100, description="Unique identifier for the track entity")
    lookback_hours: int = Field(24, ge=1, le=168, description="Analysis window in hours (max 7 days)")

class MissionLocation(BaseModel):
    lat: float
    lon: float
    radius_nm: int
    updated_at: Optional[str] = None
