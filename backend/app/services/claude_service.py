import litellm
from app.config import settings
from app.models.gdd import GDDSections
from app.prompts.gdd_prompt import GAME_DESIGN_SYSTEM_PROMPT, build_gdd_prompt

GDD_SECTIONS = ["overview", "mechanics", "progression", "levels", "characters", "ui", "audio", "visual"]


async def generate_gdd(concept_card: dict) -> GDDSections:
    sections: dict[str, str] = {}

    for section in GDD_SECTIONS:
        prompt = build_gdd_prompt(concept_card, section)
        response = litellm.completion(
            model=settings.llm_model,
            api_key=settings.llm_api_key,
            max_tokens=1500,
            messages=[
                {"role": "system", "content": GAME_DESIGN_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        sections[section] = response.choices[0].message.content or ""

    return GDDSections(**sections)


async def generate_gdd_section(concept_card: dict, section: str) -> str:
    prompt = build_gdd_prompt(concept_card, section)
    response = litellm.completion(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        max_tokens=1500,
        messages=[
            {"role": "system", "content": GAME_DESIGN_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content or ""


async def refine_gdd_section(section_name: str, current_content: str, instructions: str) -> str:
    prompt = (
        f"You are refining the **{section_name}** section of a Game Design Document.\n\n"
        f"Current content:\n{current_content}\n\n"
        f"Developer's instructions: {instructions}\n\n"
        "Apply the requested changes and return the updated section in markdown format. "
        "Keep everything that wasn't changed. Be specific and concrete."
    )
    response = litellm.completion(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        max_tokens=1500,
        messages=[
            {"role": "system", "content": GAME_DESIGN_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )
    return response.choices[0].message.content or ""
