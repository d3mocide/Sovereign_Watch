"""Pydantic models for the user / authentication subsystem."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

VALID_ROLES = ("viewer", "operator", "admin")


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until token expiry


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    created_at: datetime | None = None


class UserCreate(BaseModel):
    username: str = Field(
        ..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$"
    )
    password: str = Field(..., min_length=8)
    role: str = Field(default="viewer")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")
        return v


class UserUpdate(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")
        return v


class FirstSetupRequest(BaseModel):
    """Used to bootstrap the first admin account when no users exist."""

    username: str = Field(
        ..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$"
    )
    password: str = Field(..., min_length=8)
