import anthropic
from app.config import settings
from app.models.gdd import GDDSections
from app.prompts.gdd_prompt import GAME_DESIGN_SYSTEM_PROMPT, build_gdd_prompt

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

GDD_SECTIONS = ["overview", "mechanics", "progression", "levels", "characters", "ui", "audio", "visual"]


async def generate_gdd(concept_card: dict) -> GDDSections:
    """Generate all 8 GDD sections using Claude. Each section is a separate call for quality."""
    sections: dict[str, str] = {}

    for section in GDD_SECTIONS:
        prompt = build_gdd_prompt(concept_card, section)
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=1500,
            system=GAME_DESIGN_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        content = response.content[0]
        sections[section] = content.text if hasattr(content, "text") else ""

    return GDDSections(**sections)


async def generate_gdd_section(concept_card: dict, section: str) -> str:
    """Regenerate a single GDD section."""
    prompt = build_gdd_prompt(concept_card, section)
    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1500,
        system=GAME_DESIGN_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    content = response.content[0]
    return content.text if hasattr(content, "text") else ""
