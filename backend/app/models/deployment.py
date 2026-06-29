from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Any, Literal, Optional
from datetime import datetime

from app.models.assets import UnityGuide


DeploymentType = Literal["storePage", "pressKit", "buildGuide"]
StorePlatform = Literal["itch", "steam"]
BuildPlatform = Literal["pc-windows", "pc-mac", "pc-linux", "webgl", "android", "ios"]


# ─── Requests ─────────────────────────────────────────────────────────────────

class GenerateStorePageRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    platform: StorePlatform = "steam"


class GeneratePressKitRequest(BaseModel):
    pass


class GenerateBuildGuideRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    platform: BuildPlatform = "pc-windows"


class UpdateGuideRequest(BaseModel):
    completed: list[bool]


# ─── Responses / storage ─────────────────────────────────────────────────────

class DeploymentOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    type: DeploymentType
    created_at: datetime
    # Store page
    platform: Optional[StorePlatform] = None
    title: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    tags: Optional[list[str]] = None
    bullets: Optional[list[str]] = None
    # Press kit
    tagline: Optional[str] = None
    description: Optional[str] = None
    key_features: Optional[list[str]] = None
    dev_blurb: Optional[str] = None
    # Build guide
    build_platform: Optional[BuildPlatform] = None
    unity_guide: Optional[UnityGuide] = None


class DeploymentInDB(BaseModel):
    project_id: str
    type: DeploymentType
    created_at: datetime = Field(default_factory=datetime.utcnow)
    platform: Optional[StorePlatform] = None
    title: Optional[str] = None
    short_description: Optional[str] = None
    long_description: Optional[str] = None
    tags: Optional[list[str]] = None
    bullets: Optional[list[str]] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    key_features: Optional[list[str]] = None
    dev_blurb: Optional[str] = None
    build_platform: Optional[BuildPlatform] = None
    unity_guide: Optional[dict[str, Any]] = None
