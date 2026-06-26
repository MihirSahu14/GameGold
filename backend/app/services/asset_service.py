"""
Phase 3 asset generation. Each artifact (sprite prompt, C# script, dialogue
tree) is generated together with its Unity setup guide in a single LLM call.
"""
from app.models.assets import DialogueTree, UnityGuide
from app.prompts.asset_prompts import (
    SPRITE_SYSTEM_PROMPT,
    SCRIPT_SYSTEM_PROMPT,
    DIALOGUE_SYSTEM_PROMPT,
    build_sprite_prompt,
    build_script_prompt,
    build_dialogue_prompt,
)
from app.services.llm_utils import complete, extract_json


def _make_guide(data: dict) -> UnityGuide:
    steps = [str(s) for s in data.get("unityGuide", [])]
    return UnityGuide(steps=steps, completed=[False] * len(steps))


async def generate_sprite_assets(
    name: str, description: str, style: str, game_context: str
) -> tuple[str, UnityGuide]:
    """Returns (image_prompt, unity_guide)."""
    data = extract_json(
        complete(SPRITE_SYSTEM_PROMPT, build_sprite_prompt(name, description, style, game_context))
    )
    image_prompt = str(data.get("imagePrompt", "")).strip()
    if not image_prompt:
        raise ValueError("LLM returned no image prompt")
    return image_prompt, _make_guide(data)


async def generate_script_asset(
    name: str, script_type: str, description: str, game_context: str
) -> tuple[str, UnityGuide]:
    """Returns (csharp_code, unity_guide)."""
    data = extract_json(
        complete(
            SCRIPT_SYSTEM_PROMPT,
            build_script_prompt(name, script_type, description, game_context),
            max_tokens=3000,
        )
    )
    code = str(data.get("code", "")).strip()
    if not code:
        raise ValueError("LLM returned no script code")
    return code, _make_guide(data)


async def generate_dialogue_asset(
    npc_name: str, personality: str, game_context: str
) -> tuple[DialogueTree, UnityGuide]:
    """Returns (dialogue_tree, unity_guide)."""
    data = extract_json(
        complete(
            DIALOGUE_SYSTEM_PROMPT,
            build_dialogue_prompt(npc_name, personality, game_context),
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
