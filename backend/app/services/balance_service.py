import uuid

from pydantic import ValidationError

from app.models.systems import (
    BalanceAnalysisOut,
    BalanceSuggestion,
    SystemNodeIn,
    SystemEdgeIn,
)
from app.prompts.balance_prompt import BALANCE_SYSTEM_PROMPT, build_balance_prompt
from app.prompts.systems_extract_prompt import (
    SYSTEMS_EXTRACT_SYSTEM_PROMPT,
    build_extract_prompt,
)
from app.services.llm_utils import _list, complete, extract_json

VALID_NODE_TYPES = {"entity", "mechanic", "event", "state"}


def _parse_suggestions(raw) -> list[BalanceSuggestion]:
    """Skip malformed suggestion entries instead of 500ing on bad LLM output."""
    if not isinstance(raw, list):
        return []
    suggestions = []
    for item in raw:
        try:
            suggestions.append(BalanceSuggestion.model_validate(item))
        except (ValidationError, TypeError):
            continue
    return suggestions


async def analyze_balance(
    nodes: list[SystemNodeIn],
    edges: list[SystemEdgeIn],
    gdd_summary: str = "",
) -> BalanceAnalysisOut:
    prompt = build_balance_prompt(nodes, edges, gdd_summary)
    data = extract_json(await complete(BALANCE_SYSTEM_PROMPT, prompt, max_tokens=2000))

    return BalanceAnalysisOut(
        exploits=data.get("exploits", []),
        power_creep=data.get("powerCreep", []),
        dominant_strategies=data.get("dominantStrategies", []),
        suggestions=_parse_suggestions(data.get("suggestions", [])),
    )


async def extract_systems(gdd_summary: str) -> list[SystemNodeIn]:
    """Extract SystemNodeIn nodes from a GDD summary via the LLM. Caller merges
    the result into the existing graph; existing nodes always win on label conflict."""
    prompt = build_extract_prompt(gdd_summary)
    data = extract_json(await complete(SYSTEMS_EXTRACT_SYSTEM_PROMPT, prompt, max_tokens=2000))

    nodes = []
    for i, n in enumerate(_list(data.get("nodes"))):
        if not isinstance(n, dict):
            continue
        node_type = n.get("type")
        label = n.get("label")
        if node_type not in VALID_NODE_TYPES or not label:
            continue
        nodes.append(
            SystemNodeIn(
                id=f"extract-{uuid.uuid4().hex[:8]}",
                type=node_type,
                label=label,
                data=n.get("stats") or {},
                position={"x": 200.0 * (i % 5), "y": 300.0 + 150.0 * (i // 5)},
            )
        )
    return nodes
