from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Any, Literal, Optional
from datetime import datetime


AssetType = Literal["sprite", "script", "dialogue"]
ArtStyle = Literal["pixel", "illustrated"]

ScriptType = Literal[
    "PlayerController2D",
    "PlayerController3D",
    "EnemyAI",
    "HealthSystem",
    "InventorySystem",
    "SaveSystem",
    "DialogueManager",
    "GameManager",
    "custom",
]


class UnityGuide(BaseModel):
    steps: list[str] = []
    completed: list[bool] = []


class DialogueChoice(BaseModel):
    text: str
    next: Optional[str] = None


class DialogueNode(BaseModel):
    id: str
    speaker: str
    text: str
    choices: list[DialogueChoice] = []


class DialogueTree(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    npc_name: str
    personality: str
    nodes: list[DialogueNode] = []


# ─── Requests ─────────────────────────────────────────────────────────────────

class GenerateSpriteRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1)
    style: ArtStyle = "pixel"


class GenerateScriptRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(min_length=1, max_length=100)
    script_type: ScriptType = "custom"
    description: str = ""


class GenerateDialogueRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    npc_name: str = Field(min_length=1, max_length=100)
    personality: str = Field(min_length=1)


class UpdateGuideRequest(BaseModel):
    completed: list[bool]


# ─── Responses / storage ─────────────────────────────────────────────────────

class AssetOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str = Field(alias="_id")
    project_id: str
    type: AssetType
    name: str
    description: str = ""
    unity_guide: UnityGuide = UnityGuide()
    created_at: datetime
    # Sprite
    url: Optional[str] = None
    style: Optional[ArtStyle] = None
    image_prompt: Optional[str] = None
    # Script
    code: Optional[str] = None
    script_type: Optional[ScriptType] = None
    # Dialogue
    tree: Optional[DialogueTree] = None


class AssetInDB(BaseModel):
    project_id: str
    type: AssetType
    name: str
    description: str = ""
    unity_guide: dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    url: Optional[str] = None
    style: Optional[ArtStyle] = None
    image_prompt: Optional[str] = None
    code: Optional[str] = None
    script_type: Optional[ScriptType] = None
    tree: Optional[dict[str, Any]] = None
