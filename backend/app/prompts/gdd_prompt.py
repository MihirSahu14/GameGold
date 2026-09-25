from app.prompts.grounding import GROUNDING_RULES

GAME_DESIGN_SYSTEM_PROMPT = """You are an expert game designer and writer with 20+ years of experience shipping indie and AAA games.
Your job is to write clear, detailed, and actionable Game Design Documents (GDDs) that developers can actually build from.

Guidelines:
- Be specific and concrete — avoid vague language like "fun mechanics" or "interesting enemies"
- Think in systems — how do mechanics interact? What emergent behaviors arise?
- Balance creativity with feasibility given the stated scope
- Use markdown formatting: headings (##), bullet points, tables where appropriate
- Write in plain text with markdown — no JSON, no special formatting outside of markdown
- Write only what the provided game details support — a short grounded section beats a padded one
""" + GROUNDING_RULES


SECTION_INSTRUCTIONS = {
    "overview": (
        "Write the **Overview** section of the GDD.\n\n"
        "Include: game summary, vision statement, key pillars (3-4 design pillars "
        "that guide every decision), target experience, and success criteria."
    ),
    "mechanics": (
        "Write the **Core Mechanics** section of the GDD.\n\n"
        "Cover: primary player actions, controls/input scheme, core systems "
        "(movement, combat, interaction, etc.), feedback loops, how mechanics "
        "reinforce the tone and hook."
    ),
    "progression": (
        "Write the **Progression & Economy** section of the GDD.\n\n"
        "Cover: player progression (skills, unlocks, story gates), in-game economy "
        "(currency, resources, crafting if applicable), difficulty curve, reward "
        "schedule, and meta-progression if any."
    ),
    "levels": (
        "Write the **Levels & World** section of the GDD.\n\n"
        "Cover: world structure (linear/open/hub?), number of levels/areas, level "
        "design philosophy, environmental storytelling, pacing across the game, "
        "and key set pieces."
    ),
    "characters": (
        "Write the **Characters & Enemies** section of the GDD.\n\n"
        "Cover: protagonist (personality, motivation, arc), key NPCs, enemy types "
        "(behaviors, attack patterns, roles), boss encounters if applicable, and "
        "how characters serve the tone."
    ),
    "ui": (
        "Write the **UI/UX** section of the GDD.\n\n"
        "Cover: HUD design philosophy (what's shown, what's hidden), menus and "
        "navigation flow, accessibility features, feedback/juice principles, and "
        "how the UI reinforces the game's tone."
    ),
    "audio": (
        "Write the **Audio Direction** section of the GDD.\n\n"
        "Cover: overall audio philosophy, music style (references welcome), "
        "adaptive audio approach, key sound design moments, voice acting approach "
        "if any, and how audio reinforces the unique hook."
    ),
    "visual": (
        "Write the **Visual Direction** section of the GDD.\n\n"
        "Cover: art style and references, color palette philosophy, character and "
        "environment design language, UI visual style, technical constraints/"
        "target resolution, and how visuals reinforce the tone."
    ),
}


def format_concept_card(concept_card: dict) -> str:
    """Every field, verbatim and untruncated. Lists (pillars, won't-do) are joined with '; '."""
    lines = []
    for key, value in concept_card.items():
        if isinstance(value, list):
            value = "; ".join(str(v) for v in value if str(v).strip())
        if value not in (None, ""):
            lines.append(f"- {key}: {value}")
    return "\n".join(lines) or "(empty concept card)"


def build_gdd_prompt(
    concept_card: dict,
    section: str,
    prior_sections_summary: str = "",
    answers: dict | None = None,
) -> str:
    parts = [
        "CONCEPT CARD (complete and authoritative — every detail below is the "
        "developer's own game):\n" + format_concept_card(concept_card)
    ]
    if answers:
        answer_lines = "\n".join(f"Q: {q}\nA: {a}" for q, a in answers.items())
        parts.append(f"DEVELOPER ANSWERS (authoritative):\n{answer_lines}")
    if prior_sections_summary:
        parts.append(
            "PREVIOUSLY GENERATED SECTIONS (stay consistent with these):\n"
            + prior_sections_summary
        )
    parts.append(
        SECTION_INSTRUCTIONS.get(section, f"Write the **{section}** section of the GDD.")
    )
    return "\n\n".join(parts)


# ─── Pitch interview (also the GDD sufficiency check) ─────────────────────────

PITCH_INTERVIEW_PROMPT = """\
You interview a game designer about their pitch. You ask; they decide.
Read their concept card (hook, pillars, won't-do list, core loop, audience) and find
what is missing, vague, or contradictory.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "questions": ["...", ...],
  "options": ["Option A: ...", "Option B: ...", "Option C: ..."],
  "comparables": ["Game title — what it shares with this pitch", ...]
}

Rules:
- questions: at most 5. Each is one concrete question about the game itself (mechanics,
  feel, structure, audience) — never business, marketing, or team. Return [] when the
  hook, the 3 pillars, the won't-do list, the core loop and the audience are all concrete.
- options: at most 3 deliberately DIFFERENT directions for the weakest part of the pitch,
  each starting "Option A:", "Option B:", "Option C:". They are options for the designer to
  pick from, edit, or ignore — never present one as the answer.
- comparables: 2-4 real, shipped games that share the hook or core loop, each with the one
  thing it shares. Never invent games. Return [] if you are not sure.
- NEVER write the hook, the pillars, or the won't-do list yourself.
"""


# Fixed questions for concepts too thin to check (no core loop, no hook) and
# the fail-closed fallback when the LLM sufficiency check itself errors.
DEFAULT_CLARIFYING_QUESTIONS = [
    "What does the player do minute to minute — what is the core gameplay loop?",
    "What makes this game different from others in its genre — what is the unique hook?",
    "Who is the player character, and what is the setting?",
    "How does the player progress — levels, unlocks, story beats, or something else?",
    "Who is the target audience, and how long is a typical play session?",
]


def build_pitch_interview_prompt(concept_card: dict) -> str:
    return (
        "Interview the designer about this pitch.\n\n"
        f"CONCEPT CARD:\n{format_concept_card(concept_card)}\n\n"
        "Return the JSON object now."
    )


# ─── Section refinement ───────────────────────────────────────────────────────

def build_refine_prompt(section_name: str, current_content: str, instructions: str) -> str:
    return (
        f"You are refining the **{section_name}** section of a Game Design Document.\n\n"
        f"Current content:\n{current_content}\n\n"
        f"Developer's instructions: {instructions}\n\n"
        "Apply the requested changes and return the updated section in markdown format. "
        "Keep everything that wasn't changed. Be specific and concrete."
    )
