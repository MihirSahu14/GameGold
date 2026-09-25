import logging
import time

from app.config import settings
from app.models.gdd import GDDSections
from app.prompts.gdd_prompt import (
    DEFAULT_CLARIFYING_QUESTIONS,
    GAME_DESIGN_SYSTEM_PROMPT,
    PITCH_INTERVIEW_PROMPT,
    build_gdd_prompt,
    build_pitch_interview_prompt,
    build_refine_prompt,
)
from app.services.llm_utils import _list, complete, extract_json

GDD_SECTIONS = ["overview", "mechanics", "progression", "levels", "characters", "ui", "audio", "visual"]

perf_logger = logging.getLogger("app.perf")


async def _timed_complete(purpose: str, *args, **kwargs) -> str:
    """Wraps `complete()` to log model, purpose, and elapsed ms — measurement only."""
    start = time.perf_counter()
    try:
        return await complete(*args, **kwargs)
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        perf_logger.info(
            "llm_call model=%s purpose=%s elapsed_ms=%.1f",
            settings.llm_model,
            purpose,
            elapsed_ms,
        )


def _clean(items, limit: int) -> list[str]:
    return [str(item).strip() for item in _list(items) if str(item).strip()][:limit]


async def pitch_interview(concept_card: dict) -> dict:
    """Questions, ≤3 labeled options and comparable games for the pitch. Raises ValueError on failure."""
    data = extract_json(
        await _timed_complete(
            "pitch_interview",
            PITCH_INTERVIEW_PROMPT,
            build_pitch_interview_prompt(concept_card),
            max_tokens=800,
        )
    )
    return {
        "questions": _clean(data.get("questions"), 5),
        "options": _clean(data.get("options"), 3),
        "comparables": _clean(data.get("comparables"), 4),
    }


async def check_concept_sufficiency(concept_card: dict) -> list[str]:
    """
    Is the concept card detailed enough to write a grounded GDD?
    Returns clarifying questions (max 5), or [] when sufficient.
    No core loop and no hook → fixed questions, no LLM call. Any LLM/parse
    failure fails closed (default questions) rather than generating from a thin card.
    """
    # Frontend sends camelCase, the stored card is snake_case.
    core_loop = str(concept_card.get("core_loop") or concept_card.get("coreLoop") or "").strip()
    unique_hook = str(concept_card.get("unique_hook") or concept_card.get("uniqueHook") or "").strip()
    if not core_loop and not unique_hook:
        return list(DEFAULT_CLARIFYING_QUESTIONS)
    try:
        return (await pitch_interview(concept_card))["questions"]
    except Exception:
        return list(DEFAULT_CLARIFYING_QUESTIONS)


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
        sections[section] = await _timed_complete(f"gdd_section:{section}", GAME_DESIGN_SYSTEM_PROMPT, prompt)

    return GDDSections(**sections)


async def refine_gdd_section(section_name: str, current_content: str, instructions: str) -> str:
    prompt = build_refine_prompt(section_name, current_content, instructions)
    return await _timed_complete("refine_gdd_section", GAME_DESIGN_SYSTEM_PROMPT, prompt)
