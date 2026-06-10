import json
import litellm

from app.config import settings
from app.models.systems import BalanceAnalysisOut, SystemNodeIn, SystemEdgeIn
from app.prompts.balance_prompt import BALANCE_SYSTEM_PROMPT, build_balance_prompt


async def analyze_balance(
    nodes: list[SystemNodeIn],
    edges: list[SystemEdgeIn],
    gdd_summary: str = "",
) -> BalanceAnalysisOut:
    prompt = build_balance_prompt(nodes, edges, gdd_summary)

    response = litellm.completion(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        max_tokens=2000,
        messages=[
            {"role": "system", "content": BALANCE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
    )

    text = response.choices[0].message.content or ""

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON for balance analysis: {exc}") from exc

    return BalanceAnalysisOut(
        exploits=data.get("exploits", []),
        power_creep=data.get("powerCreep", []),
        dominant_strategies=data.get("dominantStrategies", []),
        suggestions=data.get("suggestions", []),
    )
