from pydantic import BaseModel, Field, ConfigDict
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


class UnityBuildPlanInDB(BaseModel):
    project_id: str
    steps: list[UnityBuildStep]
    summary: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class StepCompleteRequest(BaseModel):
    step_number: int
    completed: bool
