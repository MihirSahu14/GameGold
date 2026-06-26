from app.models.systems import BalanceAnalysisOut, SystemNodeIn, SystemEdgeIn
from app.prompts.balance_prompt import BALANCE_SYSTEM_PROMPT, build_balance_prompt
from app.services.llm_utils import complete, extract_json


async def analyze_balance(
    nodes: list[SystemNodeIn],
    edges: list[SystemEdgeIn],
    gdd_summary: str = "",
) -> BalanceAnalysisOut:
    prompt = build_balance_prompt(nodes, edges, gdd_summary)
    data = extract_json(complete(BALANCE_SYSTEM_PROMPT, prompt, max_tokens=2000))

    return BalanceAnalysisOut(
        exploits=data.get("exploits", []),
        power_creep=data.get("powerCreep", []),
        dominant_strategies=data.get("dominantStrategies", []),
        suggestions=data.get("suggestions", []),
    )
