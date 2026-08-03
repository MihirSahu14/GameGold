from app.models.gdd import GDDSections
from app.prompts.gdd_prompt import (
    CONCEPT_CHECK_SYSTEM_PROMPT,
    GAME_DESIGN_SYSTEM_PROMPT,
    build_concept_check_prompt,
    build_gdd_prompt,
)
from app.services.llm_utils import complete, extract_json

GDD_SECTIONS = ["overview", "mechanics", "progression", "levels", "characters", "ui", "audio", "visual"]


async def check_concept_sufficiency(concept_card: dict) -> list[str]:
    """
    One LLM call: is the concept card detailed enough to write a grounded GDD?
    Returns clarifying questions (max 5), or [] when sufficient.
    Never blocks generation: any LLM/parse failure is treated as sufficient.
    """
    try:
        data = extract_json(
            await complete(
                CONCEPT_CHECK_SYSTEM_PROMPT,
                build_concept_check_prompt(concept_card),
                max_tokens=500,
            )
        )
    except Exception:
        return []
    if data.get("sufficient") is False:
        return [str(q) for q in data.get("questions", []) if str(q).strip()][:5]
    return []


async def generate_gdd(concept_card: dict, answers: dict | None = None) -> GDDSections:
    sections: dict[str, str] = {}

    for section in GDD_SECTIONS:
        # Compact summary of earlier sections so later ones stay coherent.
        prior = "\n".join(
            f"[{name}] {' '.join(text.split())[:200]}"
            for name, text in sections.items()
            if text
        )
        prompt = build_gdd_prompt(concept_card, section, prior, answers)
        sections[section] = await complete(GAME_DESIGN_SYSTEM_PROMPT, prompt)

    return GDDSections(**sections)


async def refine_gdd_section(section_name: str, current_content: str, instructions: str) -> str:
    prompt = (
        f"You are refining the **{section_name}** section of a Game Design Document.\n\n"
        f"Current content:\n{current_content}\n\n"
        f"Developer's instructions: {instructions}\n\n"
        "Apply the requested changes and return the updated section in markdown format. "
        "Keep everything that wasn't changed. Be specific and concrete."
    )
    return await complete(GAME_DESIGN_SYSTEM_PROMPT, prompt)
