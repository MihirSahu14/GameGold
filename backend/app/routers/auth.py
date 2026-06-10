from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from bson import ObjectId
from jose import JWTError
from app.db.mongodb import get_db
from app.models.user import UserCreate, UserLogin, UserOut, UserInDB, TokenResponse
from app.services.auth_service import hash_password, verify_password, create_access_token, decode_token

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


def serialize_user(user: dict) -> dict:
    user["_id"] = str(user["_id"])
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    db = get_db()
    try:
        user_id = decode_token(credentials.credentials)
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return serialize_user(user)
    except (JWTError, Exception):
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/register", response_model=TokenResponse, response_model_by_alias=True, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate):
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
        hashed_password=hash_password(data.password),
    )

    result = await db.users.insert_one(user_in_db.model_dump())
    user = await db.users.find_one({"_id": result.inserted_id})
    user = serialize_user(user)

    token = create_access_token(user["_id"])
    return TokenResponse(
        access_token=token,
        user=UserOut(**user),
    )


@router.post("/login", response_model=TokenResponse, response_model_by_alias=True)
async def login(data: UserLogin):
    db = get_db()

    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = serialize_user(user)
    token = create_access_token(user["_id"])
    return TokenResponse(
        access_token=token,
        user=UserOut(**user),
    )


@router.get("/me", response_model=UserOut, response_model_by_alias=True)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserOut(**current_user)
