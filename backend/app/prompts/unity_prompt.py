"""
Prompts for the Unity prototype build plan (5-stage restructure, 2026-09-25).
Input = the designer's pillars + prototype goal (core loop) + generated assets.
"""
from app.prompts.grounding import GROUNDING_RULES

UNITY_PLAN_SYSTEM_PROMPT = """\
You are a senior Unity developer building a PROTOTYPE that proves one core mechanic:
greybox geometry, labeled placeholder art, one mechanic — nothing else. Given the
designer's pillars, prototype goal (the core loop) and generated assets, produce a
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
- component.setField { gameObjectName: string, componentType: string, field: string, value: string|number|boolean }
- asset.createScript { className: string, path: string }
- asset.importSprite { name: string, path: string, pixelsPerUnit?: number }
- playmode.enter     {}
- playmode.exit      {}

Rules:
- stepNumber must be sequential starting at 1.
- Generate up to 30 steps — only what the prototype goal and assets support. Fewer
  grounded steps beat padding.
- Start with scene.new, then build ONLY what the prototype goal needs — no menus,
  no save systems, no polish, no second mechanic.
- Anything without a sprite asset is a primitive (cube, quad, capsule) named
  "PLACEHOLDER_<thing>".
- description: plain-English intent in Unity terms — component names and field
  values, e.g. "Add Rigidbody2D to Player, gravity scale 0". Never mention tool
  names in a description: it must read as an instruction for a human or any
  Unity MCP client.
- Create GameObjects before adding components to them.
- Create script files (asset.createScript) before attaching them (component.add).
- asset.createScript is ONLY for scripts listed in the ASSETS list with type
  "script". className must be EXACTLY that asset's name; args are ONLY
  {className, path} — never include "code" (the stored script is injected
  client-side). Never create a script that is not in the ASSETS list.
- component.setField "value" must be a single scalar (string, number, or
  boolean) — never an object or array.
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
    pillars: list[str],
    prototype_goal: str,
    asset_list: str,
) -> str:
    pillar_lines = "\n".join(f"- {p}" for p in pillars if p.strip()) or "(none written yet)"
    return f"""\
Generate the Unity prototype build plan for this game.

Game: {game_title} ({genre} — {platform})

Prototype goal (the one core loop to prove):
{prototype_goal}

Design pillars (every step must serve one):
{pillar_lines}

Generated assets to import:
{asset_list}

Return the JSON object now.
"""
