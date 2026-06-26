"""
Prompts for Phase 3 asset generation. Every artifact ships with a Unity setup
guide generated in the same LLM call (core GameGold rule).
"""

UNITY_GUIDE_RULES = """\
Unity guide rules:
- "unityGuide" must be an array of 4-8 step strings.
- Each step references exact Unity UI elements: panel names (Project, Hierarchy,
  Inspector), menu paths (Assets > Create > ...), and component/field names.
- Steps are written for the EXACT artifact you generated (its name, fields, values).
- One concrete action per step. No vague steps like "set it up in Unity".
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
"""


def build_sprite_prompt(name: str, description: str, style: str, game_context: str) -> str:
    style_text = (
        "pixel art, crisp pixels, limited palette, 32x32 to 64x64 scale"
        if style == "pixel"
        else "2D illustrated, clean vector-like shapes, smooth shading"
    )
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    return f"""\
Create the image prompt and Unity guide for this sprite.
{context}
Sprite name: {name}
Description: {description}
Art style: {style_text}

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
"""


def build_script_prompt(name: str, script_type: str, description: str, game_context: str) -> str:
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    extra = f"Additional requirements: {description}\n" if description else ""
    return f"""\
Write the C# script and Unity guide.
{context}
Class name: {name}
Script type: {script_type}
{extra}
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
"""


def build_dialogue_prompt(npc_name: str, personality: str, game_context: str) -> str:
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    return f"""\
Create the dialogue tree and Unity guide.
{context}
NPC name: {npc_name}
Personality: {personality}

Return the JSON object now.
"""
