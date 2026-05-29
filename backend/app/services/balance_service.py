import json
import anthropic

from app.config import settings
from app.models.systems import BalanceAnalysisOut, SystemNodeIn, SystemEdgeIn
from app.prompts.balance_prompt import BALANCE_SYSTEM_PROMPT, build_balance_prompt

client = anthropic.Anthropic(api_key=settings.anthropic_api_key)


async def analyze_balance(
    nodes: list[SystemNodeIn],
    edges: list[SystemEdgeIn],
    gdd_summary: str = "",
) -> BalanceAnalysisOut:
    prompt = build_balance_prompt(nodes, edges, gdd_summary)

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        system=BALANCE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text if response.content else ""

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Claude returned invalid JSON for balance analysis: {exc}") from exc

    return BalanceAnalysisOut(
        exploits=data.get("exploits", []),
        power_creep=data.get("powerCreep", []),
        dominant_strategies=data.get("dominantStrategies", []),
        suggestions=data.get("suggestions", []),
    )
