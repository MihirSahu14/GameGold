"""
Double-submit CSRF protection for cookie-based auth.

The session JWT lives in an httpOnly cookie, so the browser attaches it
automatically on cross-site requests too — that's what makes CSRF possible.
We pair it with a second, JS-readable cookie holding a random token; the
frontend echoes that value back as a header on every mutating request, which
a third-party site cannot do (it can't read our cookie to forge the header).
Bearer-token clients (e.g. the Unity MCP, mobile apps) skip this check
entirely since forging an Authorization header isn't something a browser
does automatically on a victim's behalf.
"""
import secrets

from fastapi import Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings

SESSION_COOKIE = "gg_session"
CSRF_COOKIE = "gg_csrf"
CSRF_HEADER = "x-csrf-token"

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
EXEMPT_PATHS = {"/auth/login", "/auth/register"}


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_auth_cookies(response: Response, token: str) -> None:
    max_age = settings.jwt_expire_minutes * 60
    common = dict(
        max_age=max_age,
        path="/",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    response.set_cookie(SESSION_COOKIE, token, httponly=True, **common)
    response.set_cookie(CSRF_COOKIE, generate_csrf_token(), httponly=False, **common)


def clear_auth_cookies(response: Response) -> None:
    for name in (SESSION_COOKIE, CSRF_COOKIE):
        response.delete_cookie(
            name, path="/", secure=settings.cookie_secure, samesite=settings.cookie_samesite
        )


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        has_session_cookie = SESSION_COOKIE in request.cookies
        has_auth_header = "authorization" in request.headers

        if (
            request.method not in SAFE_METHODS
            and request.url.path not in EXEMPT_PATHS
            and has_session_cookie
            and not has_auth_header
        ):
            cookie_token = request.cookies.get(CSRF_COOKIE)
            header_token = request.headers.get(CSRF_HEADER)
            if not cookie_token or not header_token or cookie_token != header_token:
                return JSONResponse(status_code=403, content={"detail": "CSRF token missing or invalid"})

        return await call_next(request)
