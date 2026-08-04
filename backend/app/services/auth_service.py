from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_expire_minutes)
    payload = {"sub": user_id, "exp": expire, "typ": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str, jti: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.refresh_expire_days)
    payload = {"sub": user_id, "exp": expire, "typ": "refresh", "jti": jti}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_typ: str) -> dict:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("sub") is None:
        raise JWTError("Missing sub claim")
    if payload.get("typ") != expected_typ:
        raise JWTError(f"Expected a {expected_typ} token")
    return payload
