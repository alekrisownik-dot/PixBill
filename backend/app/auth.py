import hmac

from fastapi import HTTPException, Request, status

from .config import get_settings


def check_password(password: str) -> bool:
    return hmac.compare_digest(password.encode(), get_settings().password.encode())


def require_login(request: Request) -> None:
    if not request.session.get("logged_in"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Zaloguj się")
