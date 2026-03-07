from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import OAuth2PasswordRequestForm
from typing import Dict, Any

from core.database import db
from .config import auth_settings
from .db import get_user_by_username, update_last_login
from .security import verify_password, create_access_token
from .dependencies import get_current_user
from .models import TokenPayload

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login")
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Dict[str, Any]:
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database not ready")

    user_data = await get_user_by_username(db.pool, form_data.username)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user, hashed_password = user_data

    if not verify_password(form_data.password, hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Generate token payload
    token_data = {
        "sub": user.username,
        "uid": user.id,
        "roles": user.roles
    }

    # Create the token
    token = create_access_token(token_data)

    # Set HTTP-only cookie
    response.set_cookie(
        key=auth_settings.COOKIE_NAME,
        value=token,
        httponly=True,
        secure=auth_settings.COOKIE_SECURE,
        samesite=auth_settings.COOKIE_SAMESITE,
        max_age=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

    # Fire and forget update to last_login
    await update_last_login(db.pool, user.id)

    return {
        "username": user.username,
        "roles": user.roles
    }

@router.post("/logout")
async def logout(response: Response) -> Dict[str, str]:
    response.delete_cookie(
        key=auth_settings.COOKIE_NAME,
        secure=auth_settings.COOKIE_SECURE,
        httponly=True,
        samesite=auth_settings.COOKIE_SAMESITE
    )
    return {"detail": "Successfully logged out"}

@router.get("/me")
async def read_users_me(current_user: TokenPayload = Depends(get_current_user)) -> Dict[str, Any]:
    return {
        "username": current_user.sub,
        "roles": current_user.roles
    }
