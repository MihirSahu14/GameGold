GAME_DESIGN_SYSTEM_PROMPT = """You are an expert game designer and writer with 20+ years of experience shipping indie and AAA games.
Your job is to write clear, detailed, and actionable Game Design Documents (GDDs) that developers can actually build from.

Guidelines:
- Be specific and concrete — avoid vague language like "fun mechanics" or "interesting enemies"
- Think in systems — how do mechanics interact? What emergent behaviors arise?
- Balance creativity with feasibility given the stated scope
- Use markdown formatting: headings (##), bullet points, tables where appropriate
- Write in plain text with markdown — no JSON, no special formatting outside of markdown
- Each section should be 200-600 words, substantive but focused
"""


def build_gdd_prompt(concept_card: dict, section: str) -> str:
    title = concept_card.get("title", "Untitled")
    tagline = concept_card.get("tagline", "")
    genre = concept_card.get("genre", "")
    platform = concept_card.get("platform", "")
    tone = concept_card.get("tone", "")
    core_loop = concept_card.get("coreLoop") or concept_card.get("core_loop", "")
    unique_hook = concept_card.get("uniqueHook") or concept_card.get("unique_hook", "")
    target_audience = concept_card.get("targetAudience") or concept_card.get("target_audience", "")
    scope = concept_card.get("estimatedScope") or concept_card.get("estimated_scope", "indie")

    section_prompts = {
        "overview": f"""Write the **Overview** section of the GDD for this game:

**Title:** {title}
**Tagline:** {tagline}
**Genre:** {genre}
**Platform:** {platform}
**Tone:** {tone}
**Core Loop:** {core_loop}
**Unique Hook:** {unique_hook}
**Target Audience:** {target_audience}
**Scope:** {scope}

Include: game summary, vision statement, key pillars (3-4 design pillars that guide every decision), target experience, and success criteria.""",

        "mechanics": f"""Write the **Core Mechanics** section of the GDD for "{title}" — a {tone} {genre} game for {platform}.

Core Loop: {core_loop}
Unique Hook: {unique_hook}

Cover: primary player actions, controls/input scheme, core systems (movement, combat, interaction, etc.), feedback loops, how mechanics reinforce the tone and hook.""",

        "progression": f"""Write the **Progression & Economy** section for "{title}" — a {scope}-scope {genre} game.

Core Loop: {core_loop}

Cover: player progression (skills, unlocks, story gates), in-game economy (currency, resources, crafting if applicable), difficulty curve, reward schedule, and meta-progression if any.""",

        "levels": f"""Write the **Levels & World** section for "{title}" — a {tone} {genre} game.

Unique Hook: {unique_hook}
Scope: {scope}

Cover: world structure (linear/open/hub?), number of levels/areas, level design philosophy, environmental storytelling, pacing across the game, and key set pieces.""",

        "characters": f"""Write the **Characters & Enemies** section for "{title}" — a {tone} {genre} game.

Target Audience: {target_audience}

Cover: protagonist (personality, motivation, arc), key NPCs, enemy types (behaviors, attack patterns, roles), boss encounters if applicable, and how characters serve the tone.""",

        "ui": f"""Write the **UI/UX** section for "{title}" — a {tone} {genre} game for {platform}.

Cover: HUD design philosophy (what's shown, what's hidden), menus and navigation flow, accessibility features, feedback/juice principles, and how the UI reinforces the game's tone.""",

        "audio": f"""Write the **Audio Direction** section for "{title}" — a {tone} {genre} game.

Cover: overall audio philosophy, music style (references welcome), adaptive audio approach, key sound design moments, voice acting approach if any, and how audio reinforces the unique hook: {unique_hook}""",

        "visual": f"""Write the **Visual Direction** section for "{title}" — a {tone} {genre} game for {platform}.

Cover: art style and references, color palette philosophy, character and environment design language, UI visual style, technical constraints/target resolution, and how visuals reinforce the tone: {tone}""",
    }

    return section_prompts.get(section, f"Write the {section} section of the GDD for {title}.")
