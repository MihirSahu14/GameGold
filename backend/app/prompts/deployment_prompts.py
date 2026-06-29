"""
Prompts for Phase 5 deployment generation: store page copy, press kit, and
Unity build configuration guides. Store page copy and press kit are marketing
text (no Unity guide); the build guide reuses the same Unity guide rules as
Phase 3 since it describes real Unity Build Settings / Player Settings steps.
"""

UNITY_GUIDE_RULES = """\
Unity guide rules:
- "steps" must be an array of 5-10 step strings.
- Each step references exact Unity UI elements: menu paths (File > Build Settings,
  Edit > Project Settings), panel names, and field names (Company Name, Product
  Name, Bundle Identifier, etc).
- One concrete action per step, tailored to the requested platform.
"""

# ─── Store page copy ──────────────────────────────────────────────────────────

STORE_PAGE_SYSTEM_PROMPT = """\
You are an expert game marketing copywriter who has shipped store pages on
itch.io and Steam.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "title": "store page title",
  "shortDescription": "1-2 sentence hook",
  "longDescription": "multi-paragraph description, markdown allowed",
  "tags": ["tag1", "tag2", ...],
  "bullets": ["feature bullet 1", "feature bullet 2", ...]
}

Copy rules:
- itch.io: punchy, casual tone, short description under 200 characters.
- steam: longer feature-bullet style, short description under 300 characters,
  long description structured with clear feature callouts.
- 5-8 tags relevant to the genre/platform/tone. 4-6 feature bullets.
- Never invent features not implied by the game context.
"""


def build_store_page_prompt(platform: str, game_context: str) -> str:
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    return f"""\
Write store page copy for this game.
{context}
Target platform: {platform}

Return the JSON object now.
"""


# ─── Press kit ────────────────────────────────────────────────────────────────

PRESS_KIT_SYSTEM_PROMPT = """\
You are a PR specialist writing a press kit for an indie game developer.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "tagline": "one-line tagline",
  "description": "2-3 paragraph game description for journalists",
  "keyFeatures": ["feature 1", "feature 2", ...],
  "devBlurb": "1 paragraph boilerplate 'About the developer' blurb"
}

Rules:
- Write for a journalist/curator audience, not players directly.
- keyFeatures: 4-6 bullet-ready feature statements.
- devBlurb: generic placeholder studio bio the developer can edit
  (do not invent a studio name; use "the developer" or similar).
"""


def build_press_kit_prompt(game_context: str) -> str:
    context = f"\nGame context:\n{game_context}\n" if game_context else ""
    return f"""\
Write a press kit for this game.
{context}
Return the JSON object now.
"""


# ─── Unity build guide ────────────────────────────────────────────────────────

BUILD_GUIDE_SYSTEM_PROMPT = f"""\
You are a senior Unity build engineer.
Given a target platform, produce a step-by-step Unity build configuration guide.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{{
  "steps": ["step 1", "step 2", ...]
}}

{UNITY_GUIDE_RULES}
The guide covers: opening File > Build Settings, switching the target platform,
configuring Player Settings (Company Name, Product Name, icons, resolution),
and any platform-specific requirements:
- pc-windows/pc-mac/pc-linux: architecture, resolution dialog, fullscreen mode.
- webgl: compression format, memory size, template settings.
- android: minimum API level, keystore creation/signing, package name.
- ios: bundle identifier, signing team, target iOS version.
"""


def build_build_guide_prompt(platform: str, title: str) -> str:
    return f"""\
Write the Unity build configuration guide.

Game title: {title}
Target platform: {platform}

Return the JSON object now.
"""
