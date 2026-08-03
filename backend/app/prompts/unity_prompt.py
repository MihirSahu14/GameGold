"""
Prompts for Phase 6 Unity MCP integration.
Claude generates a structured, step-by-step Unity build plan from the project's
GDD + systems graph + generated assets.
"""
from app.prompts.grounding import GROUNDING_RULES

UNITY_PLAN_SYSTEM_PROMPT = """\
You are a senior Unity developer building a game from an AI-generated design document.
Given a project's GDD summary, systems graph, and generated assets, produce a
step-by-step Unity build plan.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "summary": "one sentence describing what will be built",
  "steps": [
    {
      "stepNumber": 1,
      "description": "human-readable description of this step",
      "tool": "tool.name",
      "args": { "key": "value" },
      "category": "scene|gameobject|component|asset|playmode"
    }
  ]
}

Available tools and their args:
- scene.new          { name?: string } — creates and saves a new scene (saved under Assets/Scenes)
- scene.list         {} — returns current scene hierarchy
- gameobject.create  { name: string, tag?: string, layer?: string, position?: {x,y,z} }
- gameobject.delete  { name: string }
- gameobject.find    { name: string }
- component.add      { gameObjectName: string, componentType: string }
- component.setField { gameObjectName: string, componentType: string, field: string, value: any }
- asset.createScript { className: string, code: string, path: string }
- asset.importSprite { name: string, path: string, pixelsPerUnit?: number }
- playmode.enter     {}
- playmode.exit      {}

Rules:
- stepNumber must be sequential starting at 1.
- Generate 10-30 steps that build a playable prototype.
- Start with scene.new, then build the core gameplay loop.
- Create GameObjects before adding components to them.
- Create script files (asset.createScript) before attaching them (component.add).
- Reference exact asset names from the provided asset list in asset steps.
- asset.importSprite steps must reference sprites by "name" EXACTLY as given in the
  ASSETS list, and must NOT include a "base64" arg — the image data is injected
  client-side before execution.
- category must exactly match one of: scene, gameobject, component, asset, playmode.
- args must be valid for the chosen tool. Do not invent tool names.
""" + GROUNDING_RULES


def build_unity_plan_prompt(
    game_title: str,
    genre: str,
    platform: str,
    gdd_summary: str,
    systems_summary: str,
    asset_list: str,
) -> str:
    return f"""\
Generate the Unity build plan for this game.

Game: {game_title} ({genre} — {platform})

GDD summary:
{gdd_summary}

Systems graph:
{systems_summary}

Generated assets to import:
{asset_list}

Return the JSON object now.
"""
