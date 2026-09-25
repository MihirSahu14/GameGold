"""Google + GitHub sign-in. Sessions are the same cookies as password login (issue_tokens)."""
import logging
import re
import secrets

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.config import settings
from app.core.rate_limit import limiter
from app.db.mongodb import get_db
from app.models.user import UserInDB
from app.routers.auth import issue_tokens
from app.services import oauth_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/oauth", tags=["auth"])

STATE_COOKIE = "gg_oauth_state"
STATE_COOKIE_PATH = "/auth/oauth"
STATE_MAX_AGE = 600
LOGIN_RATE_LIMIT = "10/minute"  # same as /auth/login


def _check_provider(provider: str) -> None:
    if provider not in oauth_service.PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")
    if not all(oauth_service.credentials(provider)):
        raise HTTPException(status_code=503, detail=f"{provider} sign-in is not configured")


def _to_login(error: str) -> RedirectResponse:
    # Redirect targets are fixed to settings.frontend_url — never user-controlled.
    return RedirectResponse(f"{settings.frontend_url}/login?error={error}", status_code=302)


def _clean_username(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", raw)[:32]


async def _unique_username(db, name: str, email: str) -> str:
    base = _clean_username(name)
    if len(base) < 2:
        base = _clean_username(email.split("@")[0])
    if len(base) < 2:
        base = "player"
    candidate, n = base, 1
    # ponytail: check-then-insert can race two signups onto one name; add a unique
    # index on users.username if that ever matters.
    while await db.users.find_one({"username": candidate}):
        n += 1
        suffix = str(n)
        candidate = base[: 32 - len(suffix)] + suffix
    return candidate


@router.get("/{provider}/start")
@limiter.limit(LOGIN_RATE_LIMIT)
async def oauth_start(request: Request, provider: str):
    _check_provider(provider)
    state = secrets.token_urlsafe(32)
    response = RedirectResponse(oauth_service.authorize_url(provider, state), status_code=302)
    response.set_cookie(
        STATE_COOKIE,
        state,
        max_age=STATE_MAX_AGE,
        httponly=True,
        samesite="lax",  # must survive the top-level redirect back from the provider
        secure=settings.cookie_secure,
        path=STATE_COOKIE_PATH,
    )
    return response


@router.get("/{provider}/callback")
@limiter.limit(LOGIN_RATE_LIMIT)
async def oauth_callback(request: Request, provider: str, code: str = "", state: str = ""):
    _check_provider(provider)
    response = await _complete(request, provider, code, state)
    response.delete_cookie(STATE_COOKIE, path=STATE_COOKIE_PATH, secure=settings.cookie_secure, samesite="lax")
    return response


async def _complete(request: Request, provider: str, code: str, state: str) -> RedirectResponse:
    expected = request.cookies.get(STATE_COOKIE, "")
    if not expected or not state or not secrets.compare_digest(expected, state):
        return _to_login("oauth_state")
    if not code:  # user denied consent, or provider returned ?error=
        return _to_login("oauth_failed")

    try:
        identity = await oauth_service.fetch_identity(provider, code)
    except Exception as exc:  # never a 500; never log the exception text (may carry tokens)
        logger.warning("OAuth %s identity fetch failed: %s", provider, type(exc).__name__)
        return _to_login("oauth_failed")

    if not identity.email:
        return _to_login("oauth_email")

    db = get_db()
    oauth_key = f"oauth.{provider}"
    user = await db.users.find_one({oauth_key: identity.provider_id})
    if not user:
        # Linking by email is safe only because the provider verified it.
        user = await db.users.find_one({"email": identity.email})
        if user:
            await db.users.update_one({"_id": user["_id"]}, {"$set": {oauth_key: identity.provider_id}})
        else:
            new_user = UserInDB(
                email=identity.email,
                username=await _unique_username(db, identity.name, identity.email),
                oauth={provider: identity.provider_id},
            )
            result = await db.users.insert_one(new_user.model_dump())
            user = {"_id": result.inserted_id}

    response = RedirectResponse(f"{settings.frontend_url}/dashboard", status_code=302)
    await issue_tokens(db, response, str(user["_id"]))
    return response
