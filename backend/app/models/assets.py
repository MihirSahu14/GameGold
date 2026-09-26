import base64
import binascii

from pydantic import BaseModel, Field, ConfigDict, field_validator
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
    effects: dict[str, int] = {}  # hidden variable deltas, e.g. {"anxiety": -2}


class DialogueBranch(BaseModel):
    when: str  # "<var> [+ <var>...] <op> <int>" or "else" — see services/dialogue_validate.py
    next: str


class DialogueNode(BaseModel):
    id: str
    speaker: str = ""
    text: str = ""
    choices: list[DialogueChoice] = []
    # Narrative format (gap 29) — all optional so AI NPC trees still load.
    next: Optional[str] = None
    bg: Optional[str] = None
    chapter: Optional[str] = None
    sfx: Optional[str] = None
    expr: Optional[str] = None
    ending: Optional[Literal["good", "neutral", "bad"]] = None
    branches: list[DialogueBranch] = []


class DialogueTree(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    npc_name: str = ""
    personality: str = ""
    nodes: list[DialogueNode] = []
    variables: dict[str, int] = {}
    start: Optional[str] = None  # default: first node


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


class ImportDialogueRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    tree: DialogueTree


PNG_DATA_URI_PREFIX = "data:image/png;base64,"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class UploadSpriteRequest(BaseModel):
    """A PNG the designer made/edited in Unity, pulled back into GameGold (no LLM)."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str = Field(min_length=1, max_length=100)
    kind: AssetKind = "sprite"
    data_uri: str = Field(max_length=12_000_000)  # ~8 MB of PNG once base64-encoded

    @field_validator("data_uri")
    @classmethod
    def png_only(cls, v: str) -> str:
        if not v.startswith(PNG_DATA_URI_PREFIX):
            raise ValueError("must be a data:image/png;base64 URI")
        try:
            raw = base64.b64decode(v[len(PNG_DATA_URI_PREFIX):], validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("invalid base64")
        if not raw.startswith(PNG_MAGIC):
            raise ValueError("not a PNG")
        return v


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
