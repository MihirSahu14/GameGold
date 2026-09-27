from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import Any, Optional
from datetime import datetime


class UnityBuildStep(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    step_number: int
    description: str
    tool: str                      # e.g. "gameobject.create"
    args: dict[str, Any] = {}
    category: str                  # "scene" | "gameobject" | "component" | "asset" | "playmode"
    completed: bool = False


class UnityBuildPlanOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    steps: list[UnityBuildStep]
    summary: str
    generated_at: datetime
    missing_scripts: list[str] = []  # component.add types with no script asset (gap 28)


class UnityBuildPlanInDB(BaseModel):
    project_id: str
    steps: list[UnityBuildStep]
    summary: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    missing_scripts: list[str] = []


class StepCompleteRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    step_number: int
    completed: bool


# ─── Read-back: what GameGold last wrote to each Unity path (edit-through-GameGold §4) ──

class UnitySyncCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    path: str = Field(min_length=8, max_length=300)       # e.g. Assets/Resources/GameGold/dialogue.json
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")        # of the exact bytes sent to the bridge
    source: str = Field(min_length=1, max_length=100)     # asset id | "settings" | "runtime"
    version: Optional[int] = None                         # built-in runtime template version (gap 40)

    @field_validator("path")
    @classmethod
    def under_assets(cls, v: str) -> str:
        if not v.startswith("Assets/") or ".." in v or ":" in v or "\\" in v:
            raise ValueError("path must stay under Assets/")
        return v


class UnitySyncOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    path: str
    sha256: str
    source: str
    version: Optional[int] = None
    synced_at: datetime


class UnitySyncInDB(BaseModel):
    project_id: str
    path: str
    sha256: str
    source: str
    version: Optional[int] = None
    synced_at: datetime = Field(default_factory=datetime.utcnow)


# ─── "Change something" (edit-through-GameGold §3) — proposed steps, never persisted ──

class UnityChangeCreate(BaseModel):
    request: str = Field(max_length=1000)
    snapshot: dict[str, Any] = {}  # scene.snapshot data; trimmed before it reaches the LLM

    @field_validator("request")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Describe the change you want")
        return v.strip()


class UnityChangeOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    summary: str
    steps: list[UnityBuildStep]
    settings_patch: Optional[dict[str, Any]] = None  # Player Settings keys only (gap 45)
