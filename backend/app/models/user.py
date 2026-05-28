from pydantic import BaseModel, EmailStr, Field
from typing import Literal
from datetime import datetime


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=32)
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str = Field(alias="_id")
    email: str
    username: str
    plan: Literal["free", "pro"] = "free"
    created_at: datetime

    model_config = {"populate_by_name": True}


class UserInDB(BaseModel):
    email: str
    username: str
    hashed_password: str
    plan: Literal["free", "pro"] = "free"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
