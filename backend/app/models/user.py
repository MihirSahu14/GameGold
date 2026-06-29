from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import Literal
from datetime import datetime


def _check_bcrypt_byte_limit(password: str) -> str:
    # bcrypt silently truncates at 72 bytes — reject anything past that instead
    # of letting two different passwords collide on a shared 72-byte prefix.
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must be at most 72 bytes")
    return password


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=8, max_length=72)

    _validate_password_bytes = field_validator("password")(_check_bcrypt_byte_limit)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)

    _validate_password_bytes = field_validator("password")(_check_bcrypt_byte_limit)


class UserOut(BaseModel):
    id: str = Field(alias="_id")
    email: str
    username: str
    plan: Literal["free", "pro"] = "free"
    created_at: datetime

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UserInDB(BaseModel):
    email: str
    username: str
    hashed_password: str
    plan: Literal["free", "pro"] = "free"
    created_at: datetime = Field(default_factory=datetime.utcnow)
