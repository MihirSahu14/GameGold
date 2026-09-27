"""
Phase 3 asset generation. Each artifact (sprite prompt, C# script, dialogue
tree) is generated together with its Unity setup guide in a single LLM call.
"""
import base64
import re

from app.models.assets import AssetProposal, DialogueTree, UnityGuide
from app.prompts.asset_prompts import (
    SPRITE_SYSTEM_PROMPT,
    SCRIPT_SYSTEM_PROMPT,
    DIALOGUE_SYSTEM_PROMPT,
    SUGGEST_SYSTEM_PROMPT,
    SVG_SPRITE_SYSTEM_PROMPTS,
    build_sprite_prompt,
    build_script_prompt,
    build_dialogue_prompt,
    build_suggest_prompt,
    build_svg_sprite_prompt,
)
from app.services.llm_utils import _list, complete, extract_json

_SVG_TAG_RE = re.compile(r"<svg[^>]*>.*?</svg>", re.IGNORECASE | re.DOTALL)
_GRADIENT_RE = re.compile(
    r"<(linearGradient|radialGradient)\b([^>]*?)(?:/>|>(.*?)</\1\s*>)", re.IGNORECASE | re.DOTALL
)
_ID_RE = re.compile(r"""\bid\s*=\s*["']([^"']+)["']""")
_STOP_COLOR_RE = re.compile(r"""stop-color\s*[:=]\s*["']?\s*([^"';\s/>]+)""", re.IGNORECASE)
_PAINT_URL_RE = re.compile(
    r"""((?:fill|stroke)\s*[:=]\s*["']?\s*)url\(\s*["']?#([^)"'\s]+)["']?\s*\)""", re.IGNORECASE
)
_EMPTY_DEFS_RE = re.compile(r"<defs\b[^>]*>\s*</defs\s*>|<defs\b[^>]*/>", re.IGNORECASE)
FLAT_FALLBACK_COLOR = "#888888"


def flatten_gradients(svg: str) -> str:
    """Gradient paint renders black in MuPDF and trips Unity's vector importer:
    swap every fill/stroke url(#id) for that gradient's first stop-color and drop
    the gradient defs. Non-paint refs (clip-path, mask) are left alone."""
    colors: dict[str, str] = {}
    for match in _GRADIENT_RE.finditer(svg):
        gid = _ID_RE.search(match.group(2))
        stop = _STOP_COLOR_RE.search(match.group(3) or "")
        if gid:
            colors[gid.group(1)] = stop.group(1) if stop else FLAT_FALLBACK_COLOR
    svg = _GRADIENT_RE.sub("", svg)
    svg = _PAINT_URL_RE.sub(lambda m: m.group(1) + colors.get(m.group(2), FLAT_FALLBACK_COLOR), svg)
    return _EMPTY_DEFS_RE.sub("", svg)


def extract_svg(text: str) -> str:
    """Pull SVG markup out of an LLM reply.
    Preferred shape: raw `<svg ...>...</svg>` markup with nothing else.
    Falls back to the older `{"svg": "..."}` JSON shape for compatibility.
    Raises ValueError if neither is found."""
    match = _SVG_TAG_RE.search(text)
    if match:
        return flatten_gradients(match.group(0))
    try:
        data = extract_json(text)
    except ValueError:
        raise ValueError("LLM returned no SVG for sprite fallback")
    svg = str(data.get("svg", "")).strip()
    if not svg:
        raise ValueError("LLM returned no SVG for sprite fallback")
    return flatten_gradients(svg)


def _make_guide(data: dict) -> UnityGuide:
    steps = [str(s) for s in _list(data.get("unityGuide"))]
    return UnityGuide(steps=steps, completed=[False] * len(steps))


async def suggest_assets(
    project: dict, sections: dict[str, str], existing_names: list[str]
) -> list[AssetProposal]:
    """One LLM call proposing 5-12 assets grounded in the GDD. Not persisted."""
    data = extract_json(
        await complete(
            SUGGEST_SYSTEM_PROMPT,
            build_suggest_prompt(
                project.get("title", ""),
                project.get("genre", ""),
                project.get("platform", ""),
                project.get("tone", ""),
                sections,
                existing_names,
            ),
            max_tokens=2000,
        )
    )
    # AssetProposal validation errors are ValueErrors → 502 in the router
    proposals = [AssetProposal(**p) for p in _list(data.get("proposals")) if isinstance(p, dict)]
    if not proposals:
        raise ValueError("LLM returned no asset proposals")
    return proposals


async def generate_sprite_assets(
    name: str, description: str, style: str, game_context: str, regen: str = "", kind: str = "sprite"
) -> tuple[str, UnityGuide]:
    """Returns (image_prompt, unity_guide)."""
    data = extract_json(
        await complete(
            SPRITE_SYSTEM_PROMPT,
            build_sprite_prompt(name, description, style, game_context, regen, kind),
        )
    )
    image_prompt = str(data.get("imagePrompt", "")).strip()
    if not image_prompt:
        raise ValueError("LLM returned no image prompt")
    return image_prompt, _make_guide(data)


async def generate_svg_sprite(name: str, image_prompt: str, style: str, kind: str = "sprite") -> str:
    """Fallback when Replicate is not configured: returns an SVG data URI."""
    system_prompt = SVG_SPRITE_SYSTEM_PROMPTS.get(kind, SVG_SPRITE_SYSTEM_PROMPTS["sprite"])
    raw = await complete(
        system_prompt, build_svg_sprite_prompt(name, image_prompt, style, kind), max_tokens=8000
    )
    svg = extract_svg(raw)
    encoded = base64.b64encode(svg.encode()).decode()
    return f"data:image/svg+xml;base64,{encoded}"


async def generate_script_asset(
    name: str, script_type: str, description: str, game_context: str, regen: str = ""
) -> tuple[str, UnityGuide]:
    """Returns (csharp_code, unity_guide)."""
    data = extract_json(
        await complete(
            SCRIPT_SYSTEM_PROMPT,
            build_script_prompt(name, script_type, description, game_context, regen),
            max_tokens=3000,
        )
    )
    code = str(data.get("code", "")).strip()
    if not code:
        raise ValueError("LLM returned no script code")
    return code, _make_guide(data)


async def generate_dialogue_asset(
    npc_name: str, personality: str, game_context: str, regen: str = ""
) -> tuple[DialogueTree, UnityGuide]:
    """Returns (dialogue_tree, unity_guide)."""
    data = extract_json(
        await complete(
            DIALOGUE_SYSTEM_PROMPT,
            build_dialogue_prompt(npc_name, personality, game_context, regen),
            max_tokens=2500,
        )
    )
    tree_data = data.get("tree")
    if not isinstance(tree_data, dict):
        tree_data = {}
    tree_data.setdefault("npcName", npc_name)
    tree_data.setdefault("personality", personality)
    tree = DialogueTree(**tree_data)
    if not tree.nodes:
        raise ValueError("LLM returned an empty dialogue tree")
    return tree, _make_guide(data)
