"""
Prompts for Phase 3 asset generation. Every artifact ships with a Unity setup
guide generated in the same LLM call (core GameGold rule).
"""
from app.prompts.grounding import GROUNDING_RULES

UNITY_GUIDE_RULES = """\
Unity guide rules:
- "unityGuide" must be an array of 4-8 step strings.
- Each step references exact Unity UI elements: panel names (Project, Hierarchy,
  Inspector), menu paths (Assets > Create > ...), and component/field names.
- Steps are written for the EXACT artifact you generated (its name, fields, values).
- One concrete action per step. No vague steps like "set it up in Unity".
"""

# ─── Regeneration (shared by all three generate prompts) ─────────────────────

def build_regen_block(previous: str, note: str) -> str:
    """Injected into a generate prompt when the developer regenerates an asset."""
    return f"""
PREVIOUS VERSION (revise this — do not start from scratch):
{previous}

DEVELOPER FEEDBACK (authoritative — must be addressed above all else):
{note}
"""


# ─── Sprites ──────────────────────────────────────────────────────────────────

SPRITE_SYSTEM_PROMPT = f"""\
You are an expert game artist and Unity technical artist.
Given a sprite request, produce an image-generation prompt and a Unity import guide.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{{
  "imagePrompt": "detailed prompt for an image generation model",
  "unityGuide": ["step 1", "step 2", ...]
}}

Image prompt rules:
- Describe subject, pose, colors, lighting and composition concretely.
- The sprite must work on a transparent or plain background (state this).
- Do NOT mention the game's title; describe only what is visible.

{UNITY_GUIDE_RULES}
The guide covers: importing the file, Texture Type, Pixels Per Unit
(32 for pixel art, 100 for illustrated), filter mode (Point for pixel art,
Bilinear for illustrated), and placing it in a scene.
""" + GROUNDING_RULES


KIND_GUIDE_NOTE = {
    "sprite": "This is a game sprite — the Unity guide should cover importing it as a Sprite (2D and UI).",
    "background": "This is a full-scene BACKGROUND, not a sprite — the Unity guide should cover setting it as a scene background or full-screen UI Image, not sprite import steps.",
    "portrait": "This is a character PORTRAIT for dialogue/UI, not a gameplay sprite — the Unity guide should cover setting it as a UI Image (e.g. in a dialogue panel), not sprite-sheet import steps.",
}


def build_sprite_prompt(
    name: str, description: str, style: str, game_context: str, regen: str = "", kind: str = "sprite"
) -> str:
    style_text = (
        "pixel art, crisp pixels, limited palette, 32x32 to 64x64 scale"
        if style == "pixel"
        else "2D illustrated, clean vector-like shapes, smooth shading"
    )
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    kind_note = KIND_GUIDE_NOTE.get(kind, KIND_GUIDE_NOTE["sprite"])
    return f"""\
Create the image prompt and Unity guide for this asset.
{context}
Asset kind: {kind}. {kind_note}
Sprite name: {name}
Description: {description}
Art style: {style_text}
{regen}
Return the JSON object now.
"""


# ─── C# Scripts ───────────────────────────────────────────────────────────────

SCRIPT_SYSTEM_PROMPT = f"""\
You are a senior Unity engineer (C#, Unity 2022 LTS+).
Given a script request, produce production-quality C# code and a Unity setup guide.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{{
  "code": "complete C# file contents",
  "unityGuide": ["step 1", "step 2", ...]
}}

Code rules:
- One complete MonoBehaviour (or plain class where appropriate) per file.
- [SerializeField] private fields with sensible defaults for anything tunable.
- XML doc comment on the class; brief comments only where logic is non-obvious.
- Use modern Unity APIs (e.g. Input System fallbacks noted in comments if used).
- Tailor behaviour to the game's genre and mechanics from the context.

{UNITY_GUIDE_RULES}
The guide covers: creating the script file, attaching it to the right GameObject,
setting each serialized field (with the default values from your code), and any
required project setup (tags, layers, input axes).
""" + GROUNDING_RULES


def build_script_prompt(
    name: str, script_type: str, description: str, game_context: str, regen: str = ""
) -> str:
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    extra = f"Additional requirements: {description}\n" if description else ""
    return f"""\
Write the C# script and Unity guide.
{context}
Class name: {name}
Script type: {script_type}
{extra}{regen}
Return the JSON object now.
"""


# ─── Dialogue trees ───────────────────────────────────────────────────────────

DIALOGUE_SYSTEM_PROMPT = f"""\
You are an expert game narrative designer.
Given an NPC personality, produce a branching dialogue tree and a Unity guide.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{{
  "tree": {{
    "npcName": "...",
    "personality": "...",
    "nodes": [
      {{
        "id": "start",
        "speaker": "npc or player",
        "text": "...",
        "choices": [{{"text": "...", "next": "node-id or null"}}]
      }}
    ]
  }},
  "unityGuide": ["step 1", "step 2", ...]
}}

Tree rules:
- 8-14 nodes. The first node has id "start".
- At least two meaningful branches that reflect the personality.
- Every "next" must reference an existing node id, or null to end the conversation.
- Dialogue lines stay in character and match the game's tone.

{UNITY_GUIDE_RULES}
The guide covers: saving the exported JSON into Assets/Dialogue/, loading it with
a DialogueManager script (TextAsset + JsonUtility or Newtonsoft), and wiring a
trigger (collider or interact key) on the NPC GameObject.
""" + GROUNDING_RULES


def build_dialogue_prompt(
    npc_name: str, personality: str, game_context: str, regen: str = ""
) -> str:
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    return f"""\
Create the dialogue tree and Unity guide.
{context}
NPC name: {npc_name}
Personality: {personality}
{regen}
Return the JSON object now.
"""


# ─── Asset suggestions from the GDD ──────────────────────────────────────────

SUGGEST_SYSTEM_PROMPT = """\
You are a game production planner for Unity developers.
Given excerpts from a game's design document (GDD), propose the concrete assets
the developer should generate next.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "proposals": [
    {"type": "sprite", "name": "...", "description": "...", "reason": "..."}
  ]
}

Proposal rules:
- 5-12 proposals. "type" is exactly one of: "sprite", "script", "dialogue".
- Skip anything already covered by the EXISTING ASSETS list — no duplicates or
  near-duplicates of an existing asset's name or purpose.
- "description" must be concrete and grounded in the GDD:
  - sprite: what it looks like, matching the visual style described in the GDD.
  - script: what behaviour it implements, per the GDD's mechanics.
  - dialogue: which NPC it is and their personality, per the GDD's characters.
- "reason" is ONE line citing the specific GDD detail that motivates the proposal.
- "name": for scripts use a valid C# class name; for dialogue use the NPC's name.
""" + GROUNDING_RULES


def build_suggest_prompt(
    title: str,
    genre: str,
    platform: str,
    tone: str,
    sections: dict[str, str],
    existing_names: list[str],
) -> str:
    gdd_text = "\n\n".join(
        f"[{key.upper()}]\n{text}" for key, text in sections.items() if text
    )
    existing = ", ".join(n for n in existing_names if n) or "none yet"
    return f"""\
Propose the next assets for this game.

Game: {title}
Genre: {genre} | Platform: {platform} | Tone: {tone}

GDD excerpts:
{gdd_text}

EXISTING ASSETS (already generated — do NOT propose these again): {existing}

Return the JSON object now.
"""


# ─── SVG fallback sprites (used when REPLICATE_API_TOKEN is not set) ──────────
# Reply with ONLY raw <svg>...</svg> markup — no JSON, no prose, no markdown fences.
# (Older prompt versions asked for a JSON-wrapped "svg" string; asset_service still
# falls back to parsing that shape if raw markup isn't found in the reply.)

SVG_SPRITE_SYSTEM_PROMPTS = {
    "sprite": """\
You are a pixel art designer. Given a sprite description, create a 16x16 pixel art SVG.

Respond with ONLY the raw SVG markup — no JSON, no prose, no markdown fences.

SVG rules:
- viewBox="0 0 16 16", shapeRendering="crispEdges", width="64" height="64".
- Each pixel is one <rect x="C" y="R" width="1" height="1" fill="#RRGGBB"/>.
- Omit background pixels (use transparency — do not add a background rect).
- Draw a recognizable representation: outline, key feature colors, clear silhouette.
- Use 4-8 colors maximum.
- ONLY <rect> elements inside the <svg>. No <text>, <circle>, <path>, <use>.
- Wrap everything in <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shapeRendering="crispEdges" width="64" height="64">...</svg>
""",
    "background": """\
You are a game background artist. Given a scene description, create a flat vector SVG background.

Respond with ONLY the raw SVG markup — no JSON, no prose, no markdown fences.

SVG rules:
- viewBox="0 0 320 180", width="1280" height="720".
- Full-bleed: must include a background fill covering the entire viewBox.
- Flat vector shapes only: <rect>, <polygon>, <circle>, <ellipse>, <path>. No <text>,
  no <image>, no filters. Solid hex fills only — no gradients, no <defs>, no url(#...) references
  (game engines and rasterizers render those black).
- 6-10 muted colors with strong light/dark value contrast for readability.
- Compose the scene described by the prompt. No characters unless explicitly asked.
- Wrap everything in <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="1280" height="720">...</svg>
""",
    "portrait": """\
You are a character portrait artist. Given a character description, create a flat vector bust portrait SVG.

Respond with ONLY the raw SVG markup — no JSON, no prose, no markdown fences.

SVG rules:
- viewBox="0 0 240 320", width="480" height="640".
- Transparent background — do not add a full-canvas background fill.
- A single character bust (head + shoulders) in flat vector shapes.
- Simple, readable face showing the requested expression.
- 5-8 colors maximum. No text. Solid hex fills only — no gradients, no <defs>, no url(#...) references.
- Wrap everything in <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" width="480" height="640">...</svg>
""",
}


def build_svg_sprite_prompt(name: str, image_prompt: str, style: str, kind: str = "sprite") -> str:
    style_note = "pixel art (limited palette, strong silhouette)" if style == "pixel" else "2D illustrated (clean shapes, vibrant colors)"
    return f"""\
Create the SVG for this game asset.
Name: {name}
Visual description: {image_prompt}
Style: {style_note}

Return the raw SVG markup now.
"""
