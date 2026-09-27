"""
Phase 4 — AI playtest simulation. One LLM call role-plays a persona through
the game (GDD + systems graph) and returns a structured QA report.
"""
from app.models.playtest import PlaytestReportInDB, BalanceSuggestion
from app.prompts.playtest_prompt import (
    PLAYTEST_SYNTHESIS_PROMPT,
    PLAYTEST_SYSTEM_PROMPT,
    build_playtest_prompt,
    build_synthesis_prompt,
)
from app.services.llm_utils import _list, complete, extract_json


def _str_list(data: dict, key: str) -> list[str]:
    return [str(item) for item in _list(data.get(key)) if str(item).strip()]


DIALOGUE_CONTEXT_CAP = 12_000


def build_dialogue_context(trees: list[dict], cap: int = DIALOGUE_CONTEXT_CAP) -> str:
    """Compact walk of one or more narrative dialogue trees, used as playtest
    context when there's no GDD yet: for each node, id/speaker/first ~160 chars
    of text/choices+effects/branches/endings. Capped to `cap` chars; if the walk
    is too long, samples nodes evenly across the whole story (rather than just
    truncating the tail) so later chapters and endings aren't the first thing cut.
    """
    lines: list[str] = []
    for tree in trees:
        nodes = tree.get("nodes") or []
        if not nodes:
            continue
        name = tree.get("npc_name") or "Story"
        lines.append(f"## {name}")
        for node in nodes:
            nid = node.get("id", "?")
            speaker = node.get("speaker", "")
            text = (node.get("text") or "")[:160]
            chapter = node.get("chapter")
            prefix = f"[{chapter}] " if chapter else ""
            line = f"{prefix}({nid}) {speaker}: {text}".strip()

            choices = node.get("choices") or []
            if choices:
                bits = []
                for c in choices:
                    effects = c.get("effects") or {}
                    eff_str = f" {effects}" if effects else ""
                    bits.append(f"\"{c.get('text', '')}\" -> {c.get('next', '?')}{eff_str}")
                line += " | choices: " + "; ".join(bits)

            branches = node.get("branches") or []
            if branches:
                line += " | branches: " + "; ".join(
                    f"{b.get('when')}->{b.get('next')}" for b in branches
                )

            if node.get("ending"):
                line += f" | ENDING: {node['ending']}"

            lines.append(line)

    if not lines:
        return ""

    joined = "\n".join(lines)
    if len(joined) <= cap:
        return joined

    # Even-sample by line, widening the stride until it fits — keeps a slice
    # of every chapter (start through end) instead of just chopping the tail,
    # which would silently drop endings and later chapters.
    step = 1
    kept = lines
    while len("\n".join(kept)) > cap and step < len(lines):
        step += 1
        kept = lines[::step]
    joined_kept = "\n".join(kept)
    return joined_kept if len(joined_kept) <= cap else joined_kept[:cap]


def build_concept_summary(concept_card: dict, riskiest_assumption: str) -> str:
    """Concept card hook/pillars/won't-do + riskiest assumption, as fallback/extra
    playtest context (gap 48) — cheap even when a full GDD or dialogue exists."""
    if not concept_card and not riskiest_assumption:
        return ""
    parts = []
    hook = concept_card.get("unique_hook")
    if hook:
        parts.append(f"Hook: {hook}")
    pillars = concept_card.get("pillars") or []
    if pillars:
        parts.append("Pillars: " + "; ".join(pillars))
    wont_do = concept_card.get("wont_do") or []
    if wont_do:
        parts.append("Won't do: " + "; ".join(wont_do))
    if riskiest_assumption:
        parts.append(f"Riskiest assumption: {riskiest_assumption}")
    return "\n".join(parts)


async def run_playtest(
    project_id: str,
    persona: str,
    design_context: str,
    systems_summary: str,
    concept_summary: str = "",
    is_narrative: bool = False,
) -> PlaytestReportInDB:
    prompt = build_playtest_prompt(persona, design_context, systems_summary, concept_summary, is_narrative)
    # 2500 truncated narrative reports mid-JSON (gap 49); the prompt also caps list sizes now.
    data = extract_json(await complete(PLAYTEST_SYSTEM_PROMPT, prompt, max_tokens=6000))

    suggestions = []
    for item in _list(data.get("balanceSuggestions")):
        if isinstance(item, dict) and item.get("issue"):
            node_id = item.get("nodeId")
            suggestions.append(
                BalanceSuggestion(
                    issue=str(item.get("issue", "")),
                    fix=str(item.get("fix", "")),
                    unity_path=str(item.get("unityPath", "")),
                    node_id=str(node_id) if node_id else None,
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


async def synthesize_sessions(notes: list[str]) -> str:
    """Plain-text summary of human session notes. Raises ValueError on an empty reply."""
    summary = (await complete(PLAYTEST_SYNTHESIS_PROMPT, build_synthesis_prompt(notes), max_tokens=800)).strip()
    if not summary:
        raise ValueError("LLM returned an empty session summary")
    return summary
