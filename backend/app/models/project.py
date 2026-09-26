from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import Annotated, Literal, Optional, get_args
from datetime import datetime

GameGenre = Literal[
    "platformer", "rpg", "puzzle", "shooter", "strategy",
    "horror", "simulation", "adventure", "fighting",
    "narrative", "visual-novel", "other"
]
GamePlatform = Literal["pc", "mobile", "web", "console", "cross-platform"]
GameTone = Literal["dark", "lighthearted", "epic", "comedic", "horror", "atmospheric", "realistic"]
ProjectStage = Literal["pitch", "prototype", "slice", "production", "ship", "killed"]
# The advance ladder. "killed" is terminal and sits off it.
STAGE_ORDER: list[str] = ["pitch", "prototype", "slice", "production", "ship"]
NEW_STAGE_IDS: set[str] = set(get_args(ProjectStage))
# Pre-restructure stage ids. concept/gdd never had a build; everything later
# had one but no human playtest evidence. Single source of truth: reused by
# both the read-time validator below and scripts/migrate_stages.py.
LEGACY_PITCH_STAGES: set[str] = {"concept", "gdd"}


def map_legacy_stage(stage: object) -> object:
    """Map a pre-restructure stage id to its 5-stage equivalent; new ids pass through."""
    if stage in NEW_STAGE_IDS:
        return stage
    return "pitch" if stage in LEGACY_PITCH_STAGES else "prototype"
PrototypeDecision = Literal["continue", "pivot", "kill"]
EstimatedScope = Literal["jam", "indie", "mid", "large"]

Line = Annotated[str, Field(max_length=200)]


class ConceptCard(BaseModel):
    title: str
    tagline: str = ""
    genre: GameGenre
    platform: GamePlatform
    tone: GameTone = "atmospheric"
    core_loop: str = ""
    unique_hook: str = ""
    target_audience: str = ""
    estimated_scope: EstimatedScope = "indie"
    pillars: list[Line] = Field(default_factory=list, max_length=3)
    wont_do: list[Line] = Field(default_factory=list, max_length=20)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectCreate(BaseModel):
    # No stage: every project starts at "pitch".
    title: str = Field(min_length=1, max_length=100)
    genre: GameGenre = "other"
    platform: GamePlatform = "pc"
    tone: GameTone = "atmospheric"


class ProjectUpdate(BaseModel):
    # No stage: it only moves through POST /advance and /decision (gated server-side).
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    concept_card: Optional[ConceptCard] = None
    cut_list: Optional[list[Line]] = Field(default=None, max_length=100)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectOut(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    title: str
    genre: GameGenre
    platform: GamePlatform
    tone: GameTone
    stage: ProjectStage
    concept_card: Optional[ConceptCard] = None
    prototype_decision: Optional[PrototypeDecision] = None
    gates: dict[str, bool] = {}
    cut_list: list[str] = []
    stage_entered_at: Optional[datetime] = None
    alpha_at: Optional[datetime] = None
    provenance_generated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    # ponytail: read-time safety net only — the real fix is running the migration
    # before deploy. This just stops a not-yet-migrated doc from 500ing on read.
    _map_legacy_stage = field_validator("stage", mode="before")(map_legacy_stage)


GateCheck = Literal["comprehension_resolved", "alpha_feature_lock", "beta_content_complete"]


class DecisionRequest(BaseModel):
    decision: PrototypeDecision


class GateCheckRequest(BaseModel):
    key: GateCheck
    value: bool


class GateOut(BaseModel):
    stage: ProjectStage
    met: bool
    missing: list[str]
    total: int


class PitchInterviewOut(BaseModel):
    questions: list[str] = []
    options: list[str] = []
    comparables: list[str] = []


class ProjectInDB(BaseModel):
    user_id: str
    title: str
    genre: GameGenre
    platform: GamePlatform
    tone: GameTone
    stage: ProjectStage = "pitch"
    concept_card: Optional[ConceptCard] = None
    prototype_decision: Optional[PrototypeDecision] = None
    gates: dict[str, bool] = Field(default_factory=dict)
    cut_list: list[str] = Field(default_factory=list)
    stage_entered_at: datetime = Field(default_factory=datetime.utcnow)
    alpha_at: Optional[datetime] = None
    provenance_generated_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
