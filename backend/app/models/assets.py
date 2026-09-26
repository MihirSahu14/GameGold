from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Any, Literal, Optional
from datetime import datetime


AssetType = Literal["sprite", "script", "dialogue"]
AssetKind = Literal["sprite", "background", "portrait"]
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
    description: str = Field(min_length=1, max_length=2000)
    style: ArtStyle = "pixel"
    kind: AssetKind = "sprite"
    regenerate_of: Optional[str] = None
    note: str = Field(default="", max_length=2000)


class GenerateScriptRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(min_length=1, max_length=100)
    script_type: ScriptType = "custom"
    description: str = Field(default="", max_length=2000)
    regenerate_of: Optional[str] = None
    note: str = Field(default="", max_length=2000)


class GenerateDialogueRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    npc_name: str = Field(min_length=1, max_length=100)
    personality: str = Field(min_length=1, max_length=2000)
    regenerate_of: Optional[str] = None
    note: str = Field(default="", max_length=2000)


class UpdateGuideRequest(BaseModel):
    completed: list[bool]


class AssetUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    approved: Optional[bool] = None
    replaced: Optional[bool] = None
    disclosed: Optional[bool] = None


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
    approved: bool = False  # old docs lack the field — default keeps them unapproved
    # Provenance (ship gate): every GameGold asset is AI-generated, so it starts as a placeholder.
    placeholder: bool = True
    replaced: bool = False
    disclosed: bool = False
    # Sprite
    url: Optional[str] = None
    style: Optional[ArtStyle] = None
    kind: AssetKind = "sprite"  # legacy docs predate this field
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
    approved: bool = False
    placeholder: bool = True
    replaced: bool = False
    disclosed: bool = False
    url: Optional[str] = None
    style: Optional[ArtStyle] = None
    kind: AssetKind = "sprite"
    image_prompt: Optional[str] = None
    code: Optional[str] = None
    script_type: Optional[ScriptType] = None
    tree: Optional[dict[str, Any]] = None


# ─── Suggestions (not persisted) ─────────────────────────────────────────────

class AssetProposal(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    type: AssetType
    name: str
    description: str
    reason: str


class SuggestAssetsResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    proposals: list[AssetProposal] = []


class BatchSpriteItem(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=2000)
    style: ArtStyle = "pixel"
    kind: AssetKind = "sprite"


class BatchSpriteRequest(BaseModel):
    items: list[BatchSpriteItem] = Field(min_length=1, max_length=12)


class BatchItemError(BaseModel):
    name: str
    detail: str


class BatchSpriteOut(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    assets: list[AssetOut] = []
    errors: list[BatchItemError] = []
