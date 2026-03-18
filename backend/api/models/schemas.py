from pydantic import BaseModel, Field
from typing import Optional

class AIModelRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_id: str = Field(..., description="LiteLLM model profile name")

class AnalyzeRequest(BaseModel):
    lookback_hours: int = Field(24, ge=1, le=168, description="Analysis window in hours (max 7 days)")
    mode: str = Field("tactical", description="Analysis persona: tactical, osint, sar")

class MissionLocation(BaseModel):
    lat: float
    lon: float
    radius_nm: int
    updated_at: Optional[str] = None
