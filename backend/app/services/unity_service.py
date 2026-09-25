"""
Phase 6 Unity MCP — build plan generation.
Claude reads the project's GDD + systems + assets and produces a structured
step-by-step Unity build plan. Each step maps directly to a tool call that the
browser sends to the local Unity MCP server (localhost:7432).
"""
from app.models.unity import UnityBuildStep
from app.prompts.unity_prompt import UNITY_PLAN_SYSTEM_PROMPT, build_unity_plan_prompt
from app.services.llm_utils import _list, complete, extract_json, strip_html


async def generate_build_plan(
    game_title: str,
    genre: str,
    platform: str,
    gdd_sections: dict,
    system_nodes: list[dict],
    assets: list[dict],
) -> tuple[str, list[UnityBuildStep]]:
    """
    Returns (summary, steps). The browser executes each step against the
    local Unity MCP server — this function only calls Claude to plan.
    """
    gdd_summary = _summarize_gdd(gdd_sections)
    systems_summary = _summarize_systems(system_nodes)
    asset_list = _summarize_assets(assets)

    data = extract_json(
        await complete(
            UNITY_PLAN_SYSTEM_PROMPT,
            build_unity_plan_prompt(
                game_title, genre, platform, gdd_summary, systems_summary, asset_list
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


def _summarize_gdd(sections: dict) -> str:
    parts = []
    for key in ("overview", "mechanics", "characters", "visual"):
        text = strip_html(sections.get(key, ""))
        if text:
            parts.append(f"[{key}] {text[:1200]}")
    return "\n".join(parts)[:5000]


def _summarize_systems(nodes: list[dict]) -> str:
    if not nodes:
        return "No systems graph defined."
    lines = [f"- {n.get('label', '?')} ({n.get('type', '?')})" for n in nodes[:20]]
    return "\n".join(lines)


def _summarize_assets(assets: list[dict]) -> str:
    if not assets:
        return "No assets generated yet."
    lines = [f"- {a.get('name', '?')} ({a.get('type', '?')})" for a in assets]
    return "\n".join(lines)
