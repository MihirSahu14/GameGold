from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import Any, Literal, Optional
from datetime import datetime


class SystemNodeIn(BaseModel):
    id: str
    type: Literal["entity", "mechanic", "event", "state"]
    label: str
    data: dict[str, Any] = {}
    position: dict[str, float] = {"x": 0, "y": 0}


class SystemEdgeIn(BaseModel):
    id: str
    source: str
    target: str
    label: Optional[str] = None


class GameSystemCreate(BaseModel):
    nodes: list[SystemNodeIn] = []
    edges: list[SystemEdgeIn] = []


class GameSystemUpdate(BaseModel):
    nodes: list[SystemNodeIn] = []
    edges: list[SystemEdgeIn] = []


class BalanceAnalysisOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    exploits: list[str] = []
    power_creep: list[str] = []
    dominant_strategies: list[str] = []
    suggestions: list[str] = []
    analyzed_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class GameSystemOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    nodes: list[SystemNodeIn] = []
    edges: list[SystemEdgeIn] = []
    analysis_cache: Optional[BalanceAnalysisOut] = None
    updated_at: datetime


class GameSystemInDB(BaseModel):
    project_id: str
    nodes: list[SystemNodeIn] = []
    edges: list[SystemEdgeIn] = []
    analysis_cache: Optional[BalanceAnalysisOut] = None
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AnalyzeRequest(BaseModel):
    nodes: list[SystemNodeIn] = []
    edges: list[SystemEdgeIn] = []
