import asyncio
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from jose import JWTError
from app.config import settings
from app.core.csrf import SESSION_COOKIE, REFRESH_COOKIE, set_auth_cookies, clear_auth_cookies
from app.core.rate_limit import limiter
from app.db.mongodb import get_db
from app.models.user import UserCreate, UserLogin, UserOut, UserInDB
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


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

    result = await db.users.insert_one(user_in_db.model_dump())
    user = await db.users.find_one({"_id": result.inserted_id})
    user = serialize_user(user)

    await issue_tokens(db, response, user["_id"])
    return UserOut(**user)


@router.post("/login", response_model=UserOut, response_model_by_alias=True)
@limiter.limit("10/minute")
async def login(request: Request, response: Response, data: UserLogin):
    db = get_db()

    user = await db.users.find_one({"email": data.email})
    if not user or not await asyncio.to_thread(verify_password, data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

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

    jti = payload.get("jti")
    record = await db.refresh_tokens.find_one({"jti": jti})
    if not record or record.get("revoked"):
        raise HTTPException(status_code=401, detail="Refresh token revoked or unknown")

    user_id = payload["sub"]
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    await db.refresh_tokens.update_one({"jti": jti}, {"$set": {"revoked": True}})
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
