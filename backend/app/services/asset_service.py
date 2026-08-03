"""
Phase 3 asset generation. Each artifact (sprite prompt, C# script, dialogue
tree) is generated together with its Unity setup guide in a single LLM call.
"""
import base64

from app.models.assets import AssetProposal, DialogueTree, UnityGuide
from app.prompts.asset_prompts import (
    SPRITE_SYSTEM_PROMPT,
    SCRIPT_SYSTEM_PROMPT,
    DIALOGUE_SYSTEM_PROMPT,
    SUGGEST_SYSTEM_PROMPT,
    SVG_SPRITE_SYSTEM_PROMPT,
    build_sprite_prompt,
    build_script_prompt,
    build_dialogue_prompt,
    build_suggest_prompt,
    build_svg_sprite_prompt,
)
from app.services.llm_utils import complete, extract_json


def _make_guide(data: dict) -> UnityGuide:
    steps = [str(s) for s in data.get("unityGuide", [])]
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
    proposals = [AssetProposal(**p) for p in data.get("proposals", [])]
    if not proposals:
        raise ValueError("LLM returned no asset proposals")
    return proposals


async def generate_sprite_assets(
    name: str, description: str, style: str, game_context: str, regen: str = ""
) -> tuple[str, UnityGuide]:
    """Returns (image_prompt, unity_guide)."""
    data = extract_json(
        await complete(
            SPRITE_SYSTEM_PROMPT,
            build_sprite_prompt(name, description, style, game_context, regen),
        )
    )
    image_prompt = str(data.get("imagePrompt", "")).strip()
    if not image_prompt:
        raise ValueError("LLM returned no image prompt")
    return image_prompt, _make_guide(data)


async def generate_svg_sprite(name: str, image_prompt: str, style: str) -> str:
    """Fallback when Replicate is not configured: returns an SVG data URI."""
    data = extract_json(
        await complete(SVG_SPRITE_SYSTEM_PROMPT, build_svg_sprite_prompt(name, image_prompt, style))
    )
    svg = str(data.get("svg", "")).strip()
    if not svg:
        raise ValueError("LLM returned no SVG for sprite fallback")
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
    tree_data = data.get("tree") or {}
    tree_data.setdefault("npcName", npc_name)
    tree_data.setdefault("personality", personality)
    tree = DialogueTree(**tree_data)
    if not tree.nodes:
        raise ValueError("LLM returned an empty dialogue tree")
    return tree, _make_guide(data)
