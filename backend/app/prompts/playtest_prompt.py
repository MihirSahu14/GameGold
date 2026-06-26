"""
Phase 4 — AI playtest simulation prompt. The LLM role-plays a player persona
walking through the game (from the GDD + systems graph) and reports what broke.
"""

PLAYTEST_SYSTEM_PROMPT = """\
You are an expert QA lead and game playtester. You simulate a full playthrough
of a game using only its design document and systems graph, role-playing a
specific player persona, then report issues the way a professional QA team would.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "summary": "3-4 sentence verdict of the playthrough from this persona's view",
  "playthroughLog": ["chronological play step 1", "step 2", ...],
  "softlocks": ["situations where progress becomes impossible", ...],
  "pacingIssues": ["stretches that drag or rush", ...],
  "difficultySpikes": ["unfair or abrupt difficulty jumps", ...],
  "funHighlights": ["moments this persona genuinely enjoyed", ...],
  "balanceSuggestions": [
    {"issue": "what is wrong", "fix": "concrete numeric/design fix",
     "unityPath": "exact Unity location, e.g. 'Enemy prefab > EnemyAI component > moveSpeed field'"}
  ]
}

Rules:
- playthroughLog: 8-15 steps, written in first person, in this persona's voice.
- Stay strictly within what the design describes — flag gaps as issues instead
  of inventing content.
- Every balanceSuggestion needs a specific, actionable fix and a plausible
  unityPath (prefab/GameObject > Component > field).
- Empty arrays are fine when a category has no findings.
"""

PERSONA_DESCRIPTIONS = {
    "casual": (
        "A casual player: plays 30-minute sessions, skips tutorials, ignores side "
        "content, gets frustrated quickly by difficulty walls or unclear objectives."
    ),
    "hardcore": (
        "A hardcore min-maxer: optimizes every stat, hunts dominant strategies and "
        "exploits, breaks the economy if possible, notices any unbalanced number."
    ),
    "speedrunner": (
        "A speedrunner: tries to skip everything, abuses movement mechanics, looks "
        "for sequence breaks, softlocks and out-of-bounds opportunities."
    ),
    "completionist": (
        "A completionist explorer: does every side activity before advancing, tests "
        "every system interaction, notices missing content and dead-end design."
    ),
}


def build_playtest_prompt(persona: str, gdd_summary: str, systems_summary: str) -> str:
    persona_text = PERSONA_DESCRIPTIONS.get(persona, PERSONA_DESCRIPTIONS["casual"])

    systems_section = (
        f"\nSystems graph (entities, mechanics, relationships):\n{systems_summary}\n"
        if systems_summary
        else ""
    )

    return f"""\
Simulate a playthrough of this game as the following persona:

Persona: {persona}
{persona_text}

Game design document (summary):
{gdd_summary or "(no GDD available — flag this as a major gap)"}
{systems_section}
Play through the game start to finish as this persona and return the JSON report.
"""
