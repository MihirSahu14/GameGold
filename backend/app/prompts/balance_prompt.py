from app.prompts.grounding import GROUNDING_RULES

BALANCE_SYSTEM_PROMPT = """\
You are an expert game balance designer with 20+ years of experience across all genres.
Your task: analyze a game's systems graph and identify balance issues.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences, no explanation.
The JSON must have exactly these four keys:
  - exploits: array of strings — infinite loops, farming exploits, cheese strategies
  - powerCreep: array of strings — elements that outscale or invalidate others over time
  - dominantStrategies: array of strings — single strategies that trivialise meaningful choices
  - suggestions: array of objects, one concrete fix per issue found, each shaped exactly:
      {"nodeLabel": string, "stat": string, "currentValue": number, "suggestedValue": number, "rationale": string}
    nodeLabel and stat MUST reference an existing node label and one of its stat keys from the graph below.

If no issues exist for a category, return an empty array.
""" + GROUNDING_RULES


def build_balance_prompt(
    nodes: list,
    edges: list,
    gdd_summary: str = "",
) -> str:
    nodes_text = "\n".join(
        f"  - [{n.type.upper()}] {n.label}"
        + (f": {n.data}" if n.data else "")
        for n in nodes
    ) or "  (none)"

    edges_text = "\n".join(
        f"  - {e.source} → {e.target}" + (f" ({e.label})" if e.label else "")
        for e in edges
    ) or "  (none)"

    context_section = (
        f"\nGame context (from GDD):\n{gdd_summary.strip()}\n" if gdd_summary.strip() else ""
    )

    return f"""\
Analyze the following game systems graph for balance issues.
{context_section}
Nodes (entities, mechanics, events, states):
{nodes_text}

Edges (relationships / interactions):
{edges_text}

Return a JSON object with keys: exploits, powerCreep, dominantStrategies, suggestions (suggestions as structured objects, see above).
"""
