from pydantic import BaseModel
from typing import Optional, Any

class AnalyzeRequest(BaseModel):
    uid: str
    lookback_hours: int = 24

class MissionLocation(BaseModel):
    lat: float
    lon: float
    radius_nm: int
    updated_at: Optional[str] = None
