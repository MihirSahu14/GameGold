"""
Unity prototype build plan. The LLM reads the pitch (pillars + core loop) and the
generated assets and produces steps that the build pack (GAMEGOLD.md) and the
basic browser bridge (localhost:7432) both use.
"""
from app.models.unity import UnityBuildStep
from app.prompts.unity_prompt import build_unity_plan_prompt, unity_plan_system_prompt
from app.services.llm_utils import _list, complete, extract_json


async def generate_build_plan(
    game_title: str,
    genre: str,
    platform: str,
    pillars: list[str],
    prototype_goal: str,
    assets: list[dict],
) -> tuple[str, list[UnityBuildStep]]:
    """Returns (summary, steps). Only calls the LLM to plan — nothing executes here."""
    data = extract_json(
        await complete(
            unity_plan_system_prompt(genre),
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

    return summary, steps


def _summarize_assets(assets: list[dict]) -> str:
    if not assets:
        return "No assets generated yet."
    lines = [f"- {a.get('name', '?')} ({a.get('type', '?')})" for a in assets]
    return "\n".join(lines)
