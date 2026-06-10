from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Literal, Optional
from datetime import datetime

GameGenre = Literal[
    "platformer", "rpg", "puzzle", "shooter", "strategy",
    "horror", "simulation", "adventure", "fighting", "other"
]
GamePlatform = Literal["pc", "mobile", "web", "console", "cross-platform"]
GameTone = Literal["dark", "lighthearted", "epic", "comedic", "horror", "atmospheric", "realistic"]
ProjectStage = Literal["concept", "gdd", "systems", "assets", "playtesting", "deployment"]
EstimatedScope = Literal["jam", "indie", "mid", "large"]


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

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    genre: GameGenre = "other"
    platform: GamePlatform = "pc"
    tone: GameTone = "atmospheric"
    stage: ProjectStage = "concept"


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    stage: Optional[ProjectStage] = None
    concept_card: Optional[ConceptCard] = None

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
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ProjectInDB(BaseModel):
    user_id: str
    title: str
    genre: GameGenre
    platform: GamePlatform
    tone: GameTone
    stage: ProjectStage = "concept"
    concept_card: Optional[ConceptCard] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
