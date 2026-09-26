"""Google + GitHub sign-in. Sessions are the same cookies as password login (issue_tokens)."""
import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.core.rate_limit import limiter
from app.db.mongodb import get_db
from app.models.user import OAuthExchange, UserInDB, UserOut, normalize_email
from app.routers.auth import issue_tokens, serialize_user
from app.services import oauth_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/oauth", tags=["auth"])

STATE_COOKIE = "gg_oauth_state"
STATE_COOKIE_PATH = "/auth/oauth"
STATE_MAX_AGE = 600
LOGIN_RATE_LIMIT = "10/minute"  # same as /auth/login
CODE_TTL_SECONDS = 60
NONCE_RE = re.compile(r"[A-Za-z0-9_-]{16,64}")


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
    # ponytail: check-then-insert can race two signups onto one name; the unique
    # index on users.username (scripts/migrate_emails) turns that race into a failed insert.
    while await db.users.find_one({"username": candidate}):
        n += 1
        suffix = str(n)
        candidate = base[: 32 - len(suffix)] + suffix
    return candidate


@router.get("/{provider}/start")
@limiter.limit(LOGIN_RATE_LIMIT)
async def oauth_start(request: Request, provider: str, nonce: str = ""):
    _check_provider(provider)
    # The web client's per-tab random nonce (sessionStorage). It rides in the state
    # cookie and comes back on the /auth/callback redirect, so a code minted for an
    # attacker's sign-in can't be redeemed in a victim's browser (login CSRF).
    if not NONCE_RE.fullmatch(nonce):
        return _to_login("oauth_state")
    state = secrets.token_urlsafe(32)  # urlsafe alphabet has no ".", so "state.nonce" splits cleanly
    response = RedirectResponse(oauth_service.authorize_url(provider, state), status_code=302)
    response.set_cookie(
        STATE_COOKIE,
        f"{state}.{nonce}",
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
    expected, _, nonce = request.cookies.get(STATE_COOKIE, "").partition(".")
    if not expected or not state or not nonce or not secrets.compare_digest(expected.encode(), state.encode()):
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

    email = normalize_email(identity.email)
    db = get_db()
    oauth_key = f"oauth.{provider}"
    user = await db.users.find_one({oauth_key: identity.provider_id})
    if not user:
        # Linking by email is safe only because the provider verified it.
        user = await db.users.find_one({"email": email})
        if not user:
            new_user = UserInDB(
                email=email,
                username=await _unique_username(db, identity.name, email),
                oauth={provider: identity.provider_id},
            )
            try:
                result = await db.users.insert_one(new_user.model_dump())
                user = {"_id": result.inserted_id, "oauth": new_user.oauth}
            except DuplicateKeyError:
                # Lost a race to a concurrent signup: link to that account if it's this
                # email; otherwise (e.g. the generated username got taken) just fail.
                user = await db.users.find_one({"email": email})
                if not user:
                    return _to_login("oauth_failed")
        linked_id = (user.get("oauth") or {}).get(provider)
        if linked_id and linked_id != identity.provider_id:
            return _to_login("oauth_conflict")
        if not linked_id:
            update: dict = {"$set": {oauth_key: identity.provider_id}}
            if user.get("hashed_password"):
                # /auth/register never verifies email, so this password may be a squatter's
                # (pre-registration takeover). The provider just proved ownership: drop the
                # password and every session it minted. The owner can set a new one via reset.
                update["$unset"] = {"hashed_password": ""}
            await db.users.update_one({"_id": user["_id"]}, update)
            if "$unset" in update:
                await db.refresh_tokens.update_many(
                    {"user_id": str(user["_id"]), "revoked": False}, {"$set": {"revoked": True}}
                )

    # Cookies set on this top-level onrender.com redirect would land in a different
    # (partitioned) jar than the one the app's XHRs from the frontend use. Hand the
    # frontend a one-time code instead; it exchanges it via XHR for the session cookies.
    code = secrets.token_urlsafe(32)
    await db.oauth_codes.insert_one(
        {
            "code_hash": _hash(code),
            "user_id": str(user["_id"]),
            "expires_at": datetime.utcnow() + timedelta(seconds=CODE_TTL_SECONDS),
            "used": False,
        }
    )
    return RedirectResponse(
        f"{settings.frontend_url}/auth/callback?{urlencode({'code': code, 'nonce': nonce})}", status_code=302
    )


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


@router.post("/exchange", response_model=UserOut, response_model_by_alias=True)
@limiter.limit(LOGIN_RATE_LIMIT)
async def oauth_exchange(request: Request, response: Response, data: OAuthExchange):
    db = get_db()
    # Atomic single-use claim — a replayed code can't pass twice.
    record = await db.oauth_codes.find_one_and_update(
        {"code_hash": _hash(data.code), "used": False, "expires_at": {"$gt": datetime.utcnow()}},
        {"$set": {"used": True}},
    )
    user = record and await db.users.find_one({"_id": ObjectId(record["user_id"])})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired sign-in code")
    user = serialize_user(user)
    await issue_tokens(db, response, user["_id"])
    return UserOut(**user)
