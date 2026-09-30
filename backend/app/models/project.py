import re
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
RiskKind = Literal["feel", "loop", "story", "tech"]

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


PlayerLook = Literal["plain", "halftone", "duotone"]
HexColor = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class PlayerSettings(BaseModel):
    """How GameGold's built-in DialoguePlayer looks/sounds; synced to Unity as player_settings.json."""
    look: PlayerLook = "plain"
    chapter_colors: dict[Annotated[str, Field(max_length=40)], HexColor] = Field(default_factory=dict, max_length=50)
    text_speed_cps: int = Field(default=40, ge=10, le=120)
    wordmark_title: bool = False
    ambience: bool = False
    volume: float = Field(default=0.5, ge=0, le=1)
    two_character_staging: bool = True
    # speaker name -> fixed stage side; unlisted speakers take a free slot.
    character_sides: dict[Annotated[str, Field(min_length=1, max_length=40)], Literal["left", "right"]] = Field(
        default_factory=dict, max_length=20
    )
    # soft concentric-ring + water-drop cue after every choice, identical regardless of the choice (gap 56).
    choice_ripple: bool = True
    # backgrounds shown exactly as drawn — no halftone/duotone print, no chapter tint (designer art, gap 61).
    original_backgrounds: list[Annotated[str, Field(min_length=1, max_length=60)]] = Field(default_factory=list, max_length=50)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


PublishTarget = Literal["local", "itch", "github_pages"]
_CRED_URL = re.compile(r"^https?://[^/]*@")
_REPO_URL = re.compile(r"^(https://[^\s@]+|git@[\w.-]+:[\w./-]+)$")
_ITCH_TARGET = r"^[\w-]+/[\w-]+$"


class ProjectHome(BaseModel):
    """Where the Unity project lives (git remote) and where web builds are published."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    repo_url: Optional[str] = None
    publish_target: PublishTarget = "local"
    itch_target: Optional[str] = None
    last_saved_at: Optional[datetime] = None
    last_saved_commit: Optional[str] = None
    last_published_url: Optional[str] = None
    last_published_at: Optional[datetime] = None


class ProjectHomeUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    repo_url: Optional[str] = Field(default=None, max_length=300)
    publish_target: Optional[PublishTarget] = None
    itch_target: Optional[str] = Field(default=None, pattern=_ITCH_TARGET, max_length=100)

    @field_validator("repo_url")
    @classmethod
    def no_credentials(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if _CRED_URL.match(v) or not _REPO_URL.match(v):
            raise ValueError("Use the repo's plain https:// or git@ URL — never one with a token or password in it")
        return v


class HomeSavedCreate(BaseModel):
    commit: str = Field(pattern=r"^[0-9a-f]{7,40}$")


class HomePublishedCreate(BaseModel):
    url: str = Field(pattern=r"^https://\S+$", max_length=300)


class ProjectCreate(BaseModel):
    # No stage: every project starts at "pitch".
    title: str = Field(min_length=1, max_length=100)
    genre: GameGenre = "other"
    platform: GamePlatform = "pc"
    tone: GameTone = "atmospheric"


class ProjectUpdate(BaseModel):
    # No stage: it only moves through POST /advance and /decision (gated server-side).
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    genre: Optional[GameGenre] = None
    concept_card: Optional[ConceptCard] = None
    cut_list: Optional[list[Line]] = Field(default=None, max_length=100)
    riskiest_assumption: Optional[str] = Field(default=None, max_length=500)
    risk_kind: Optional[RiskKind] = None
    player_settings: Optional[PlayerSettings] = None
    home: Optional[ProjectHomeUpdate] = None

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
    riskiest_assumption: str = ""
    risk_kind: Optional[RiskKind] = None
    player_settings: PlayerSettings = Field(default_factory=PlayerSettings)
    home: ProjectHome = Field(default_factory=ProjectHome)
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
    riskiest_assumption: str = ""
    risk_kind: Optional[RiskKind] = None
    player_settings: PlayerSettings = Field(default_factory=PlayerSettings)
    home: ProjectHome = Field(default_factory=ProjectHome)
    stage_entered_at: datetime = Field(default_factory=datetime.utcnow)
    alpha_at: Optional[datetime] = None
    provenance_generated_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
