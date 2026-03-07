from fastapi import Request, HTTPException, Depends
from typing import Optional, List, Callable
from .config import auth_settings
from .models import TokenPayload
from .security import decode_access_token

def get_current_user(request: Request) -> TokenPayload:
    """
    FastAPI dependency to extract and decode the JWT from the HTTP-only cookie.
    """
    token = request.cookies.get(auth_settings.COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return payload

def require_roles(*roles: str) -> Callable[[TokenPayload], TokenPayload]:
    """
    Dependency factory to check if the current user has at least one of the required roles.
    """
    def role_checker(current_user: TokenPayload = Depends(get_current_user)) -> TokenPayload:
        if not set(roles).intersection(set(current_user.roles)):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return role_checker
