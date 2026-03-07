from typing import List
from pydantic import BaseModel

class User(BaseModel):
    id: str
    username: str
    roles: List[str]

class TokenPayload(BaseModel):
    sub: str
    uid: str
    roles: List[str]
    exp: int
