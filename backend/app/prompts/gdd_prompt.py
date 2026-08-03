from app.prompts.grounding import GROUNDING_RULES

GAME_DESIGN_SYSTEM_PROMPT = """You are an expert game designer and writer with 20+ years of experience shipping indie and AAA games.
Your job is to write clear, detailed, and actionable Game Design Documents (GDDs) that developers can actually build from.

Guidelines:
- Be specific and concrete — avoid vague language like "fun mechanics" or "interesting enemies"
- Think in systems — how do mechanics interact? What emergent behaviors arise?
- Balance creativity with feasibility given the stated scope
- Use markdown formatting: headings (##), bullet points, tables where appropriate
- Write in plain text with markdown — no JSON, no special formatting outside of markdown
- Each section should be 200-600 words, substantive but focused
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
    """Every field, verbatim and untruncated."""
    lines = [
        f"- {key}: {value}"
        for key, value in concept_card.items()
        if value not in (None, "")
    ]
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


# ─── Concept sufficiency check (interview mode) ───────────────────────────────

CONCEPT_CHECK_SYSTEM_PROMPT = """\
You review a game concept card before a full Game Design Document is written from it.
Decide whether the concept contains enough concrete detail to write a specific,
non-generic GDD (core loop, unique hook, tone, and audience actually described).

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences.
Either: {"sufficient": true}
Or:     {"sufficient": false, "questions": ["...", ...]}

Rules:
- At most 5 questions. Each is a single concrete question about the game that the
  concept card leaves unanswered and that a GDD writer would need answered.
- Ask about the game itself (mechanics, setting, characters, structure) — never
  about business, marketing, or team.
- Only mark insufficient when key creative details are missing or too vague to
  design from.
"""


def build_concept_check_prompt(concept_card: dict) -> str:
    return (
        "Review this concept card for sufficiency.\n\n"
        f"CONCEPT CARD:\n{format_concept_card(concept_card)}\n\n"
        "Return the JSON object now."
    )
