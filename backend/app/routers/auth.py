import asyncio
import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from jose import JWTError
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from app.config import settings
from app.core.csrf import SESSION_COOKIE, REFRESH_COOKIE, set_auth_cookies, clear_auth_cookies
from app.core.rate_limit import limiter
from app.db.mongodb import get_db
from app.models.user import (
    UserCreate,
    UserLogin,
    UserOut,
    UserInDB,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.services.email_sender import send_password_reset
from app.services.llm_utils import current_llm_user

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)

LOGIN_LOCKOUT_THRESHOLD = 8
LOGIN_LOCKOUT_MINUTES = 15
LOGIN_FAILURE_WINDOW_MINUTES = 15


def serialize_user(user: dict) -> dict:
    user["_id"] = str(user["_id"])
    return user


async def issue_tokens(db, response: Response, user_id: str) -> None:
    """Mint an access/refresh pair, record the refresh jti, and set cookies."""
    jti = secrets.token_urlsafe(32)
    await db.refresh_tokens.insert_one(
        {
            "jti": jti,
            "user_id": user_id,
            "expires_at": datetime.utcnow() + timedelta(days=settings.refresh_expire_days),
            "revoked": False,
        }
    )
    set_auth_cookies(response, create_access_token(user_id), create_refresh_token(user_id, jti))


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    token = request.cookies.get(SESSION_COOKIE) or (credentials.credentials if credentials else None)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_db()
    try:
        user_id = decode_token(token, "access")["sub"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user = serialize_user(user)
    request.state.user_id = user["_id"]
    current_llm_user.set(user)  # complete() picks the user's own LLM key from here
    return user


@router.post("/register", response_model=UserOut, response_model_by_alias=True, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, data: UserCreate):
    db = get_db()

    # Check email uniqueness
    if await db.users.find_one({"email": data.email}):
        raise HTTPException(status_code=409, detail="Email already registered")

    # Check username uniqueness
    if await db.users.find_one({"username": data.username}):
        raise HTTPException(status_code=409, detail="Username already taken")

    user_in_db = UserInDB(
        email=data.email,
        username=data.username,
        hashed_password=await asyncio.to_thread(hash_password, data.password),
    )

    try:
        result = await db.users.insert_one(user_in_db.model_dump())
    except DuplicateKeyError:  # a concurrent signup beat the checks above to the unique index
        raise HTTPException(status_code=409, detail="Email or username already taken")
    user = await db.users.find_one({"_id": result.inserted_id})
    user = serialize_user(user)

    await issue_tokens(db, response, user["_id"])
    return UserOut(**user)


@router.post("/login", response_model=UserOut, response_model_by_alias=True)
@limiter.limit("10/minute")
async def login(request: Request, response: Response, data: UserLogin):
    db = get_db()

    now = datetime.utcnow()
    attempt = await db.login_attempts.find_one({"email": data.email})
    locked_until = attempt.get("locked_until") if attempt else None
    if locked_until and locked_until > now:
        retry_after = max(int((locked_until - now).total_seconds()), 1)
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    user = await db.users.find_one({"email": data.email})
    # OAuth-only accounts have no password: same generic 401, same lockout count.
    hashed = user.get("hashed_password") if user else None
    if not hashed or not await asyncio.to_thread(verify_password, data.password, hashed):
        # An expired lock or failures older than the window start a fresh count,
        # so one stray failure after a lockout can't immediately re-lock.
        last_failed_at = (attempt or {}).get("last_failed_at")
        stale = attempt and (
            locked_until is not None
            or not last_failed_at
            or last_failed_at < now - timedelta(minutes=LOGIN_FAILURE_WINDOW_MINUTES)
        )
        if stale:
            await db.login_attempts.update_one(
                {"email": data.email}, {"$set": {"failed_count": 0, "locked_until": None}}
            )
        # ponytail: $inc is atomic per request; the stale-reset above can race
        # with a concurrent failure, which at worst drops one count.
        record = await db.login_attempts.find_one_and_update(
            {"email": data.email},
            {"$inc": {"failed_count": 1}, "$set": {"last_failed_at": now}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        if record["failed_count"] >= LOGIN_LOCKOUT_THRESHOLD:
            await db.login_attempts.update_one(
                {"email": data.email},
                {"$set": {"locked_until": now + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)}},
            )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.update_one(
        {"email": data.email}, {"$set": {"failed_count": 0, "locked_until": None}}, upsert=True
    )

    user = serialize_user(user)
    await issue_tokens(db, response, user["_id"])
    return UserOut(**user)


@router.post("/refresh", response_model=UserOut, response_model_by_alias=True)
async def refresh(request: Request, response: Response):
    db = get_db()
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_token(token, "refresh")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Atomic check-and-revoke: two concurrent refreshes with the same token
    # can't both mint a new pair.
    record = await db.refresh_tokens.find_one_and_update(
        {"jti": payload.get("jti"), "revoked": False, "expires_at": {"$gt": datetime.utcnow()}},
        {"$set": {"revoked": True}},
    )
    if not record:
        raise HTTPException(status_code=401, detail="Refresh token revoked or unknown")

    user_id = payload["sub"]
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    await issue_tokens(db, response, user_id)
    return UserOut(**serialize_user(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response):
    db = get_db()
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        try:
            jti = decode_token(token, "refresh").get("jti")
            await db.refresh_tokens.update_one({"jti": jti}, {"$set": {"revoked": True}})
        except JWTError:
            pass
    clear_auth_cookies(response)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(response: Response, current_user: dict = Depends(get_current_user)):
    # ponytail: access tokens stay stateless and simply expire within 15 minutes;
    # a denylist is the upgrade only if sub-15-minute revocation is ever required.
    db = get_db()
    await db.refresh_tokens.update_many(
        {"user_id": current_user["_id"], "revoked": False}, {"$set": {"revoked": True}}
    )
    clear_auth_cookies(response)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def forgot_password(request: Request, response: Response, data: ForgotPasswordRequest):
    # Always 202, whether or not the email exists — never leak account existence.
    db = get_db()
    user = await db.users.find_one({"email": data.email})
    if user:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        await db.password_resets.insert_one(
            {
                "token_hash": token_hash,
                "user_id": str(user["_id"]),
                "expires_at": datetime.utcnow() + timedelta(minutes=30),
                "used": False,
            }
        )
        await send_password_reset(data.email, f"/reset-password?token={token}")


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def reset_password(request: Request, response: Response, data: ResetPasswordRequest):
    db = get_db()
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    # Atomic single-use claim — a replayed token can't pass the check twice.
    record = await db.password_resets.find_one_and_update(
        {"token_hash": token_hash, "used": False, "expires_at": {"$gt": datetime.utcnow()}},
        {"$set": {"used": True}},
    )
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    hashed = await asyncio.to_thread(hash_password, data.new_password)
    await db.users.update_one({"_id": ObjectId(record["user_id"])}, {"$set": {"hashed_password": hashed}})
    await db.refresh_tokens.update_many(
        {"user_id": record["user_id"], "revoked": False}, {"$set": {"revoked": True}}
    )


@router.get("/me", response_model=UserOut, response_model_by_alias=True)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserOut(**current_user)


@router.get("/csrf")
async def get_csrf_token(request: Request):
    """
    Returns the CSRF token from the session cookie so the frontend can store it
    in memory. Required because cross-origin JS (Vercel) cannot read a cookie
    set by a different domain (Render) via document.cookie.
    """
    from app.core.csrf import CSRF_COOKIE
    token = request.cookies.get(CSRF_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="No active session")
    return {"csrf_token": token}
