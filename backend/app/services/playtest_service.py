"""
Phase 4 — AI playtest simulation. One LLM call role-plays a persona through
the game (GDD + systems graph) and returns a structured QA report.
"""
from app.models.playtest import PlaytestReportInDB, BalanceSuggestion
from app.prompts.playtest_prompt import PLAYTEST_SYSTEM_PROMPT, build_playtest_prompt
from app.services.llm_utils import complete, extract_json


def _str_list(data: dict, key: str) -> list[str]:
    return [str(item) for item in data.get(key, []) if str(item).strip()]


async def run_playtest(
    project_id: str, persona: str, gdd_summary: str, systems_summary: str
) -> PlaytestReportInDB:
    prompt = build_playtest_prompt(persona, gdd_summary, systems_summary)
    data = extract_json(complete(PLAYTEST_SYSTEM_PROMPT, prompt, max_tokens=2500))

    suggestions = []
    for item in data.get("balanceSuggestions", []):
        if isinstance(item, dict) and item.get("issue"):
            suggestions.append(
                BalanceSuggestion(
                    issue=str(item.get("issue", "")),
                    fix=str(item.get("fix", "")),
                    unity_path=str(item.get("unityPath", "")),
                ).model_dump()
            )

    return PlaytestReportInDB(
        project_id=project_id,
        persona=persona,  # type: ignore[arg-type]
        summary=str(data.get("summary", "")),
        playthrough_log=_str_list(data, "playthroughLog"),
        softlocks=_str_list(data, "softlocks"),
        pacing_issues=_str_list(data, "pacingIssues"),
        difficulty_spikes=_str_list(data, "difficultySpikes"),
        fun_highlights=_str_list(data, "funHighlights"),
        balance_suggestions=suggestions,
    )
