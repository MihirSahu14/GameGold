"""
Unity prototype build plan. Narrative games get a fixed plan built on GameGold's own
DialoguePlayer runtime (no LLM). Other genres: the LLM reads the pitch (pillars + core
loop) and the generated assets and produces steps that the build pack (GAMEGOLD.md) and
the basic browser bridge (localhost:7432) both use.
"""
import re
from datetime import datetime
from pathlib import Path

from app.kits.registry import RESOURCES, Kit
from app.models.project import PlayerSettings
from app.models.unity import UnityBuildStep
from app.prompts.unity_prompt import UNITY_PLAN_SYSTEM_PROMPT, build_unity_plan_prompt
from app.prompts.unity_change_prompt import (
    CHANGE_ALLOWED_TOOLS, CHANGE_MAX_STEPS, PLAYER_SETTINGS_FIELDS, UNITY_CHANGE_SYSTEM_PROMPT,
    build_unity_change_prompt,
)
from app.services.llm_utils import _list, complete, extract_json

# DialoguePlayer.cs inspector field names covered by Player Settings (player_settings.json overrides
# them at Start()) — a component.setField targeting one of these on DialoguePlayer is stripped (gap 45).
_SETTINGS_OWNED_DIALOGUEPLAYER_FIELDS = frozenset(
    {"look", "charsPerSecond", "wordmarkTitle", "ambience", "volume", "chapterColors", "twoCharacterStaging", "characterSides", "choiceRipple", "originalBackgrounds"}
)

# GameGold-shipped runtime scripts (C# source, not prompts) — read once at import.
UNITY_TEMPLATES = {
    p.stem: p.read_text(encoding="utf-8")
    for p in (Path(__file__).resolve().parent.parent / "unity_templates").glob("*.cs")
}

_VERSION_HEADER = re.compile(r"^// GameGold \w+ v(\d+)")


def template_version(code: str) -> int | None:
    """Version from the template's first line (`// GameGold DialoguePlayer v<N>`) — bump it on every change (gap 40)."""
    m = _VERSION_HEADER.match(code)
    return int(m.group(1)) if m else None


# component.add types that never need a generated script.
# ponytail: hand-kept list of common built-ins; a rare built-in shows up as "missing" — add it here.
UNITY_BUILTIN_COMPONENTS = {
    "Transform", "RectTransform", "Camera", "Light", "Light2D", "AudioSource", "AudioListener",
    "Animator", "Animation", "SpriteRenderer", "MeshRenderer", "MeshFilter", "LineRenderer",
    "TrailRenderer", "ParticleSystem", "Rigidbody", "Rigidbody2D", "BoxCollider", "SphereCollider",
    "CapsuleCollider", "MeshCollider", "CharacterController", "BoxCollider2D", "CircleCollider2D",
    "CapsuleCollider2D", "PolygonCollider2D", "EdgeCollider2D", "CompositeCollider2D",
    "Canvas", "CanvasScaler", "GraphicRaycaster", "CanvasGroup", "Image", "RawImage", "Text",
    "Button", "Toggle", "Slider", "Scrollbar", "ScrollRect", "InputField", "Dropdown", "Mask",
    "RectMask2D", "VerticalLayoutGroup", "HorizontalLayoutGroup", "GridLayoutGroup",
    "LayoutElement", "ContentSizeFitter", "AspectRatioFitter", "EventSystem",
    "StandaloneInputModule", "InputSystemUIInputModule", "PlayerInput", "TextMeshProUGUI",
    "TextMeshPro", "Grid", "Tilemap", "TilemapRenderer", "TilemapCollider2D", "NavMeshAgent",
}

DIALOGUE_OBJECT = "GameGold Dialogue"
SPRITE_FOLDERS = {"background": "Backgrounds", "portrait": "Portraits"}


async def generate_build_plan(
    game_title: str,
    genre: str,
    platform: str,
    pillars: list[str],
    prototype_goal: str,
    assets: list[dict],
) -> tuple[str, list[UnityBuildStep], list[str]]:
    """Returns (summary, steps, missing_scripts). Only calls the LLM to plan — nothing executes here."""
    data = extract_json(
        await complete(
            UNITY_PLAN_SYSTEM_PROMPT,
            build_unity_plan_prompt(
                game_title, genre, platform, pillars, prototype_goal, _summarize_assets(assets)
            ),
            max_tokens=4000,
        )
    )

    summary = str(data.get("summary", "Unity build plan")).strip()
    script_names = {str(a.get("name")) for a in assets if a.get("type") == "script"}

    steps: list[UnityBuildStep] = []
    for raw in _list(data.get("steps")):
        try:
            tool = str(raw.get("tool", ""))
            args = dict(raw.get("args") or {})
            if tool == "asset.createScript":
                # Only scripts we actually generated; code is injected client-side
                # from the stored asset, so the model's code (if any) is dropped.
                if args.get("className") not in script_names:
                    continue
                class_name = args["className"]
                args = {"className": class_name, "path": args.get("path") or f"Assets/Scripts/{class_name}.cs"}
            steps.append(UnityBuildStep(
                step_number=len(steps) + 1,  # ignore the model's numbering
                description=str(raw.get("description", "")),
                tool=tool,
                args=args,
                category=str(raw.get("category", "gameobject")),
            ))
        except Exception:
            continue

    if not steps:
        raise ValueError("Claude returned an empty build plan")

    return summary, steps, missing_scripts(steps, script_names)


def missing_scripts(steps: list[UnityBuildStep], script_names: set[str]) -> list[str]:
    """component.add types that are neither Unity built-ins nor stored script assets (gap 28)."""
    missing: list[str] = []
    for s in steps:
        if s.tool != "component.add":
            continue
        name = str(s.args.get("componentType", "")).split(".")[-1]
        if name and name not in UNITY_BUILTIN_COMPONENTS and name not in script_names and name not in missing:
            missing.append(name)
    return missing


def pick_dialogue(assets: list[dict]) -> dict | None:
    """The story to play: designer-written (non-placeholder) first, then the newest."""
    dialogues = [a for a in assets if a.get("type") == "dialogue"]
    if not dialogues:
        return None
    return max(dialogues, key=lambda a: (a.get("placeholder") is False, a.get("created_at") or datetime.min))


def narrative_plan(assets: list[dict]) -> tuple[str, list[UnityBuildStep]]:
    """Fixed plan on GameGold's DialoguePlayer. Caller guarantees a dialogue asset exists."""
    dialogue = pick_dialogue(assets)
    assert dialogue is not None
    raw: list[tuple[str, str, dict, str]] = [
        ("Create and save a new scene named Story", "scene.new", {"name": "Story", "saveCurrent": True}, "scene"),
        ("Add GameGold's DialoguePlayer script (builds the story UI at runtime)", "asset.createScript",
         {"className": "DialoguePlayer", "path": "Assets/Scripts/DialoguePlayer.cs"}, "asset"),
        (f"Save the '{dialogue['name']}' story JSON to Resources so DialoguePlayer can load it", "asset.createText",
         {"dialogue": dialogue["name"], "path": "Assets/Resources/GameGold/dialogue.json"}, "asset"),
    ]
    for a in assets:
        folder = SPRITE_FOLDERS.get(a.get("kind", "sprite"))
        if a.get("type") == "sprite" and folder:
            file = re.sub(r"[^\w\- ]", "_", str(a.get("name", "")))
            raw.append((
                f"Import the {a.get('kind')} '{a.get('name')}' into Resources/GameGold/{folder}",
                "asset.importSprite",
                {"name": a.get("name"), "path": f"Assets/Resources/GameGold/{folder}/{file}.png"},
                "asset",
            ))
    raw += [
        (f"Create an empty GameObject named {DIALOGUE_OBJECT}", "gameobject.create", {"name": DIALOGUE_OBJECT}, "gameobject"),
        (f"Add the DialoguePlayer component to {DIALOGUE_OBJECT}", "component.add",
         {"gameObjectName": DIALOGUE_OBJECT, "componentType": "DialoguePlayer"}, "component"),
        ("Enter Play mode and play the story: click to finish a line, click again to advance", "playmode.enter", {}, "playmode"),
    ]
    steps = [
        UnityBuildStep(step_number=i, description=d, tool=t, args=args, category=c)
        for i, (d, t, args, c) in enumerate(raw, start=1)
    ]
    return f"Play '{dialogue['name']}' in Unity with GameGold's DialoguePlayer", steps


KIT_SPRITES = f"{RESOURCES}/Sprites"
# IL2CPP/WebGL builds can strip Input System types the kit runtimes only reach via Keyboard.current/Mouse.current.
LINK_XML_PATH = "Assets/GameGold/link.xml"
LINK_XML = '<linker>\n  <assembly fullname="Unity.InputSystem" preserve="all" ignoreIfMissing="1"/>\n</linker>\n'


def kit_data_asset(kit: Kit, assets: list[dict]) -> dict | None:
    """The data file the kit's runtime plays: designer-written first, then the newest."""
    if kit.id == "narrative":
        return pick_dialogue(assets)
    data = [a for a in assets if a.get("type") == "data" and a.get("kind") == kit.data_kind]
    if not data:
        return None
    return max(data, key=lambda a: (a.get("placeholder") is False, a.get("created_at") or datetime.min))


KIT_PACKAGES = ("com.unity.ugui",)


def runtime_plan(kit: Kit, assets: list[dict]) -> tuple[str, list[UnityBuildStep]]:
    """Fixed, no-LLM plan on a GameGold kit runtime. Caller guarantees kit_data_asset() exists.
    The web injects file contents: {data: name} → the data asset's JSON, {kitSettings: id} →
    project.kitSettings[id] (or {} so the runtime keeps its defaults)."""
    if kit.id == "narrative":
        return narrative_plan(assets)  # predates kits; keeps its Backgrounds/Portraits folders
    data = kit_data_asset(kit, assets)
    assert data is not None
    obj = kit.object_name
    raw: list[tuple[str, str, dict, str]] = [
        ("Create and save a new scene named Game", "scene.new", {"name": "Game", "saveCurrent": True}, "scene"),
        # Unity's default template has no uGUI package, and every kit runtime builds its UI with it (gap 75).
        ("Make sure the Unity UI package is installed", "packages.ensure", {"names": list(KIT_PACKAGES)}, "asset"),
        (f"Add GameGold's {kit.runtime_class} script (builds the game from JSON at runtime)", "asset.createScript",
         {"className": kit.runtime_class, "path": kit.runtime_path}, "asset"),
        (f"Save the '{data['name']}' {kit.data_kind} JSON to Resources so {kit.runtime_class} can load it",
         "asset.createText", {"data": data["name"], "path": kit.data_path}, "asset"),
        ("Add a link.xml so player builds keep the Input System the runtime reads", "asset.createText",
         {"path": LINK_XML_PATH, "content": LINK_XML}, "asset"),
    ]
    if kit.settings_path:
        raw.append((f"Save the {kit.title} settings JSON to Resources", "asset.createText",
                    {"kitSettings": kit.id, "path": kit.settings_path}, "asset"))
    for a in assets:
        if a.get("type") == "sprite":
            raw.append((
                f"Import the sprite '{a.get('name')}' into Resources/GameGold/Sprites",
                "asset.importSprite",
                {"name": a.get("name"), "path": f"{KIT_SPRITES}/{_sprite_file(a)}.png"},
                "asset",
            ))
    raw += [
        ("Wait for Unity to finish compiling the scripts", "editor.awaitCompile", {}, "asset"),
        (f"Create an empty GameObject named {obj}", "gameobject.create", {"name": obj}, "gameobject"),
        (f"Add the {kit.runtime_class} component to {obj}", "component.add",
         {"gameObjectName": obj, "componentType": kit.runtime_class}, "component"),
        ("Save the scene (Build for web needs it saved)", "scene.save", {}, "scene"),
        ("Make it the scene web builds start in (Build Settings)", "build.scenes",
         {"scenes": ["Assets/Scenes/Game.unity"]}, "scene"),
        ("Enter Play mode and play it", "playmode.enter", {}, "playmode"),
    ]
    steps = [
        UnityBuildStep(step_number=i, description=d, tool=t, args=args, category=c)
        for i, (d, t, args, c) in enumerate(raw, start=1)
    ]
    return f"Play '{data['name']}' in Unity with GameGold's {kit.runtime_class}", steps


def _sprite_file(asset: dict) -> str:
    return re.sub(r"[^\w\- ]", "_", str(asset.get("name", "")))


def _summarize_assets(assets: list[dict]) -> str:
    if not assets:
        return "No assets generated yet."
    lines = [f"- {a.get('name', '?')} ({a.get('type', '?')})" for a in assets]
    return "\n".join(lines)


def _validate_settings_patch(raw_patch: object, current: PlayerSettings) -> dict | None:
    """Only known Player Settings keys, and only if applying them still validates. Returns just the
    changed keys (camelCase), or None if there's nothing usable (gap 45)."""
    if not isinstance(raw_patch, dict):
        return None
    candidate = {k: v for k, v in raw_patch.items() if k in PLAYER_SETTINGS_FIELDS}
    if not candidate:
        return None
    current_out = current.model_dump(by_alias=True)
    try:
        validated = PlayerSettings.model_validate({**current_out, **candidate})
    except Exception:
        return None
    validated_out = validated.model_dump(by_alias=True)
    changed = {k: v for k, v in validated_out.items() if k in candidate and v != current_out.get(k)}
    return changed or None


def _strip_settings_owned_fields(steps: list[UnityBuildStep]) -> list[UnityBuildStep]:
    """Drop component.setField steps on DialoguePlayer fields Player Settings owns (gap 45) —
    applies regardless of whether the LLM also returned a settings_patch, so nothing slips through."""
    return [
        s for s in steps
        if not (
            s.tool == "component.setField"
            and str(s.args.get("componentType")) == "DialoguePlayer"
            and str(s.args.get("field")) in _SETTINGS_OWNED_DIALOGUEPLAYER_FIELDS
        )
    ]


async def plan_change(
    request: str, snapshot: dict, player_settings: dict
) -> tuple[str, list[UnityBuildStep], dict | None]:
    """"Change something": scene-only bridge steps, plus an optional Player Settings patch for
    text-speed/look/tint/wordmark/ambience/volume requests (gap 45). Unknown/forbidden tools are
    dropped, capped at 12."""
    current = PlayerSettings(**(player_settings or {}))
    data = extract_json(
        await complete(
            UNITY_CHANGE_SYSTEM_PROMPT,
            build_unity_change_prompt(request, snapshot, current.model_dump(by_alias=True)),
            max_tokens=2000,
        )
    )
    steps: list[UnityBuildStep] = []
    for raw in _list(data.get("steps")):
        if len(steps) >= CHANGE_MAX_STEPS:
            break
        try:
            tool = str(raw.get("tool", ""))
            if tool not in CHANGE_ALLOWED_TOOLS:
                continue
            steps.append(UnityBuildStep(
                step_number=len(steps) + 1,
                description=str(raw.get("description", "")),
                tool=tool,
                args=dict(raw.get("args") or {}),
                category=tool.split(".")[0],
            ))
        except Exception:
            continue
    steps = _strip_settings_owned_fields(steps)
    # Renumber after stripping so step numbers stay contiguous.
    for i, s in enumerate(steps, start=1):
        s.step_number = i

    settings_patch = _validate_settings_patch(data.get("settingsPatch") or data.get("settings_patch"), current)

    summary = str(data.get("summary", "")).strip()
    if not steps and not settings_patch:
        raise ValueError(summary or "No scene steps for that change — story, settings and art are edited in GameGold.")
    return summary or "Proposed change", steps, settings_patch
