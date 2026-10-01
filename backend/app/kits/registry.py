"""
Genre kits: a GameGold-shipped Unity runtime (unity_templates/<runtime_class>.cs) that plays a
JSON data file the designer edits in GameGold, a validator for that file, and a fixed no-LLM
Unity plan (unity_service.runtime_plan). Narrative (DialoguePlayer) was the first kit.

Adding a kit = one KIT entry below + its template, validator module and sample file. A kit
whose template, validator or sample isn't on disk yet is listed but unavailable, and projects
on it fall back to the LLM plan.
"""
import importlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal, Optional, get_args

KitId = Literal["narrative", "grid", "platformer", "arena_shooter", "card_battler", "fps"]
KIT_IDS: tuple[str, ...] = get_args(KitId)

_APP = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = _APP / "unity_templates"
SAMPLES_DIR = Path(__file__).resolve().parent / "samples"
RESOURCES = "Assets/Resources/GameGold"

Validator = Callable[[dict], list[str]]


@dataclass(frozen=True)
class Kit:
    id: KitId
    title: str                    # shown in the UI; the plan's GameObject is "GameGold <title>"
    runtime_class: str            # template file stem = MonoBehaviour class name
    data_kind: str                # asset kind of the data file ("dialogue" = the dialogue asset type)
    data_path: str                # where the runtime loads the data in Unity
    settings_path: Optional[str]  # optional settings JSON the runtime reads (None = no settings file)
    genres: frozenset[str]        # GameGold genres that default to this kit
    validator: str                # module exposing validate(data: dict) -> list[str]
    sample: Optional[str] = None  # file under kits/samples/ (None = no sample shipped)

    @property
    def runtime_path(self) -> str:
        return f"Assets/Scripts/{self.runtime_class}.cs"

    @property
    def object_name(self) -> str:
        return f"GameGold {self.title}"


KITS: dict[str, Kit] = {k.id: k for k in (
    Kit("narrative", "Dialogue", "DialoguePlayer", "dialogue", f"{RESOURCES}/dialogue.json",
        f"{RESOURCES}/player_settings.json", frozenset({"narrative", "visual-novel"}),
        "app.services.dialogue_validate"),
    Kit("grid", "Grid", "GridPlayer", "levels", f"{RESOURCES}/levels.json",
        None, frozenset({"puzzle"}), "app.services.grid_validate", "grid.json"),
    Kit("platformer", "Platformer", "PlatformerRunner", "platformer_levels", f"{RESOURCES}/levels.json",
        f"{RESOURCES}/platformer_settings.json", frozenset({"platformer"}),
        "app.services.platformer_validate", "platformer.json"),
    Kit("arena_shooter", "Arena", "ArenaShooter", "arena", f"{RESOURCES}/arena.json",
        None, frozenset({"shooter"}), "app.services.arena_shooter_validate", "arena_shooter.json"),
    Kit("card_battler", "Cards", "CardBattlePlayer", "cardgame", f"{RESOURCES}/cardgame.json",
        None, frozenset({"card-battler"}), "app.services.card_battler_validate", "card_battler.json"),
    Kit("fps", "FPS Arena", "ArenaPlayer", "fps_arena", f"{RESOURCES}/arena.json",
        f"{RESOURCES}/fps_settings.json", frozenset({"fps"}), "app.services.fps_validate", "fps.json"),
)}

# Data kinds stored as generic "data" assets (narrative keeps its own dialogue asset type).
DataKind = Literal["levels", "platformer_levels", "arena", "cardgame", "fps_arena"]
DATA_KINDS: tuple[str, ...] = get_args(DataKind)


def load_validator(kit: Kit) -> Optional[Validator]:
    try:
        fn = getattr(importlib.import_module(kit.validator), "validate", None)
    except ImportError:
        return None
    return fn if callable(fn) else None


def missing_parts(kit: Kit) -> list[str]:
    """What's not on disk yet; empty = the kit is available."""
    missing = []
    if not (TEMPLATES_DIR / f"{kit.runtime_class}.cs").is_file():
        missing.append(f"runtime unity_templates/{kit.runtime_class}.cs")
    if load_validator(kit) is None:
        missing.append(f"validator {kit.validator}.validate")
    if kit.sample and not (SAMPLES_DIR / kit.sample).is_file():
        missing.append(f"sample kits/samples/{kit.sample}")
    return missing


def is_available(kit: Kit) -> bool:
    return not missing_parts(kit)


def load_sample(kit: Kit) -> Optional[dict]:
    if not kit.sample:
        return None
    try:
        return json.loads((SAMPLES_DIR / kit.sample).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def kit_for_data_kind(kind: str) -> Optional[Kit]:
    return next((k for k in KITS.values() if k.data_kind == kind), None)


_FIRST_PERSON = re.compile(r"\b(first[- ]person|fps)\b", re.IGNORECASE)


def _pitch_text(project: dict) -> str:
    card = project.get("concept_card") or {}
    return " ".join(str(v) for v in (project.get("title"), *card.values()) if isinstance(v, str))


def kit_for_project(project: dict) -> Optional[Kit]:
    """Explicit override (project.kit) first, then the genre. None = no kit (LLM plan)."""
    override = project.get("kit")
    if override in KITS:
        return KITS[override]
    genre = project.get("genre")
    if genre == "shooter" and _FIRST_PERSON.search(_pitch_text(project)):
        return KITS["fps"]
    return next((k for k in KITS.values() if genre in k.genres), None)
