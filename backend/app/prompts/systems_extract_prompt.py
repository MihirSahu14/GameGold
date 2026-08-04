from app.prompts.grounding import GROUNDING_RULES

SYSTEMS_EXTRACT_SYSTEM_PROMPT = """\
You are an expert game systems designer. Extract the entities, mechanics, events, \
and states described in a Game Design Document into a systems graph.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences.
The JSON must have exactly one key, "nodes", an array of objects each with:
  - type: one of "entity", "mechanic", "event", "state"
  - label: short name for the node
  - stats: an object of stat name -> numeric value (empty object if none apply)

Only extract nodes that are clearly described in the GDD. Do not invent nodes.
""" + GROUNDING_RULES


def build_extract_prompt(gdd_summary: str) -> str:
    return f"""\
Extract a systems graph from the following Game Design Document.

GDD:
{gdd_summary.strip() or "(empty)"}

Return a JSON object with key: nodes.
"""
