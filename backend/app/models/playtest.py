import base64
import binascii
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator
from pydantic.alias_generators import to_camel
from typing import Literal, Optional
from datetime import datetime


PlaytestPersona = Literal[
    "casual", "hardcore", "speedrunner", "completionist",
    # Narrative personas (genre == narrative/visual-novel) — see gap 47.
    "skimmer", "careful_reader", "choice_agonizer", "replayer",
]
BugSeverity = Literal["low", "medium", "high", "critical"]
BugStatus = Literal["open", "in-progress", "fixed", "wontfix"]
PlaytestKind = Literal["ai_persona", "session", "agent_play"]
AgentPersona = Literal["first_timer", "impatient", "poker", "custom"]
AgentAction = Literal["click", "key", "wait", "stop"]
TesterRing = Literal["self", "friends", "discord", "steam_playtest", "ea"]


class BalanceSuggestion(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    issue: str
    fix: str
    unity_path: str = ""
    node_id: Optional[str] = None  # dialogue node this issue ties to, when known


class AgentStepSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    n: int
    action: AgentAction
    note: str = ""


class RunPlaytestRequest(BaseModel):
    persona: PlaytestPersona = "casual"


class PlaytestReportOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    kind: PlaytestKind = "ai_persona"  # legacy docs predate sessions — all AI
    persona: Optional[PlaytestPersona] = None
    # Human session fields (kind == "session")
    testers: Optional[int] = None
    ring: Optional[TesterRing] = None
    kept_playing_unprompted: Optional[int] = None
    notes: str = ""
    summary: str = ""
    playthrough_log: list[str] = []
    softlocks: list[str] = []
    pacing_issues: list[str] = []
    difficulty_spikes: list[str] = []
    fun_highlights: list[str] = []
    balance_suggestions: list[BalanceSuggestion] = []
    # Agent playthrough fields (kind == "agent_play")
    agent_persona: Optional[AgentPersona] = None
    game_url: Optional[str] = None
    steps: list[AgentStepSummary] = []
    stop_reason: Optional[str] = None
    confusions: list[str] = []
    bugs: list[str] = []
    choices: list[str] = []
    would_keep_playing: Optional[bool] = None
    felt: str = ""
    created_at: datetime


class PlaytestReportInDB(BaseModel):
    project_id: str
    kind: PlaytestKind = "ai_persona"
    persona: PlaytestPersona
    summary: str = ""
    playthrough_log: list[str] = []
    softlocks: list[str] = []
    pacing_issues: list[str] = []
    difficulty_spikes: list[str] = []
    fun_highlights: list[str] = []
    balance_suggestions: list[dict] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PlaytestSessionCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    testers: int = Field(ge=1, le=100000)
    ring: TesterRing
    kept_playing_unprompted: int = Field(default=0, ge=0)
    notes: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def kept_within_testers(self):
        if self.kept_playing_unprompted > self.testers:
            raise ValueError("keptPlayingUnprompted cannot exceed testers")
        return self


class PlaytestSessionInDB(BaseModel):
    project_id: str
    kind: PlaytestKind = "session"
    testers: int
    ring: TesterRing
    kept_playing_unprompted: int = 0
    notes: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentPlayReportInDB(BaseModel):
    project_id: str
    kind: PlaytestKind = "agent_play"
    agent_persona: AgentPersona
    game_url: str
    steps: list[dict] = []
    stop_reason: str = ""
    felt: str = ""
    summary: str = ""
    confusions: list[str] = []
    bugs: list[str] = []
    choices: list[str] = []
    fun_highlights: list[str] = []
    softlocks: list[str] = []
    pacing_issues: list[str] = []
    would_keep_playing: Optional[bool] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Agent playthroughs of the live build ────────────────────────────────────

LOCAL_PLAY_PREFIX = "http://localhost:7432/play/"
MAX_FRAME_BYTES = 400 * 1024


class AgentRunCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    url: str = Field(max_length=2000)
    personas: list[AgentPersona] = Field(min_length=1, max_length=4)
    custom: str = Field(default="", max_length=300)

    @field_validator("url")
    @classmethod
    def playable_url(cls, v: str) -> str:
        if any(c.isspace() for c in v):
            raise ValueError("url must not contain spaces")
        if v.startswith(LOCAL_PLAY_PREFIX):
            return v
        parts = urlsplit(v)
        if parts.scheme != "https" or not parts.hostname or "@" in parts.netloc:
            raise ValueError("url must be the local build (http://localhost:7432/play/…) or an https:// link")
        return v

    @model_validator(mode="after")
    def custom_needs_text(self):
        if len(set(self.personas)) != len(self.personas):
            raise ValueError("personas must be unique")
        if "custom" in self.personas and not self.custom.strip():
            raise ValueError("Describe the custom persona")
        return self


class AgentRunOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    run_id: str
    max_steps: int
    agents: list[AgentPersona]
    using_own_key: bool


class AgentRunInDB(BaseModel):
    project_id: str
    user_id: str
    url: str
    agents: list[AgentPersona]
    custom: str = ""
    max_steps: int
    using_own_key: bool
    steps_used: dict[str, int] = {}
    bad_reads: dict[str, int] = {}
    finished: list[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentStepCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    agent: AgentPersona
    n: int = Field(ge=1, le=60)
    jpeg_base64: str = Field(max_length=(MAX_FRAME_BYTES * 4) // 3 + 4)
    page_url: str = Field(default="", max_length=2000)
    # Screenshot pixel size (what the model sees) and the viewport size the
    # bridge clicks in — the backend scales the model's coords from one to the other.
    screen_width: int = Field(ge=1, le=10000)
    screen_height: int = Field(ge=1, le=10000)
    viewport_width: int = Field(ge=1, le=10000)
    viewport_height: int = Field(ge=1, le=10000)

    @field_validator("jpeg_base64")
    @classmethod
    def small_jpeg(cls, v: str) -> str:
        try:
            raw = base64.b64decode(v, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("jpegBase64 is not valid base64")
        if len(raw) > MAX_FRAME_BYTES:
            raise ValueError("Screenshot is larger than 400 KB")
        if not raw.startswith(b"\xff\xd8\xff"):
            raise ValueError("Screenshot is not a JPEG")
        return v


class AgentStepOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    action: AgentAction
    x: Optional[int] = None
    y: Optional[int] = None
    key: Optional[str] = None
    note: str = ""
    stop_reason: Optional[str] = None


class AgentFinishCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stop_reason: str = Field(default="", max_length=300)


class AgentFrameOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    n: int
    jpeg_base64: str


class AgentEstimateOut(BaseModel):
    usd: Optional[float] = None


class SessionSynthesisOut(BaseModel):
    summary: str


class PersonaOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: PlaytestPersona
    label: str
    icon: str
    blurb: str


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
