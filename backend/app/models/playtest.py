from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Literal, Optional
from datetime import datetime


PlaytestPersona = Literal["casual", "hardcore", "speedrunner", "completionist"]
BugSeverity = Literal["low", "medium", "high", "critical"]
BugStatus = Literal["open", "in-progress", "fixed", "wontfix"]


class BalanceSuggestion(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    issue: str
    fix: str
    unity_path: str = ""


class RunPlaytestRequest(BaseModel):
    persona: PlaytestPersona = "casual"


class PlaytestReportOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    persona: PlaytestPersona
    summary: str = ""
    playthrough_log: list[str] = []
    softlocks: list[str] = []
    pacing_issues: list[str] = []
    difficulty_spikes: list[str] = []
    fun_highlights: list[str] = []
    balance_suggestions: list[BalanceSuggestion] = []
    created_at: datetime


class PlaytestReportInDB(BaseModel):
    project_id: str
    persona: PlaytestPersona
    summary: str = ""
    playthrough_log: list[str] = []
    softlocks: list[str] = []
    pacing_issues: list[str] = []
    difficulty_spikes: list[str] = []
    fun_highlights: list[str] = []
    balance_suggestions: list[dict] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Bugs ─────────────────────────────────────────────────────────────────────

class BugCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    severity: BugSeverity = "medium"
    gdd_section: Optional[str] = None


class BugUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[BugSeverity] = None
    status: Optional[BugStatus] = None
    gdd_section: Optional[str] = None


class BugOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    title: str
    description: str = ""
    severity: BugSeverity = "medium"
    status: BugStatus = "open"
    gdd_section: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class BugInDB(BaseModel):
    project_id: str
    title: str
    description: str = ""
    severity: BugSeverity = "medium"
    status: BugStatus = "open"
    gdd_section: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
