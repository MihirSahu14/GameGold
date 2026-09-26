"""
Phase 4 — AI playtest simulation prompt. The LLM role-plays a player persona
walking through the game (from the GDD + systems graph) and reports what broke.
"""
from app.prompts.grounding import GROUNDING_RULES

PLAYTEST_SYSTEM_PROMPT = """\
You are an expert QA lead and game playtester. You PREDICT the issues a specific
player persona would likely hit, using only the game's design document and systems
graph. Your output is shown to the designer as "Predicted issues" — a guess from the
design, never a substitute for real players.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "summary": "3-4 sentence prediction of how this persona would experience the game",
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
- playthroughLog: up to 15 steps; only steps the design supports. First person,
  in this persona's voice.
- Stay strictly within what the design describes — flag gaps as issues instead
  of inventing content.
- Every balanceSuggestion needs a specific, actionable fix and a plausible
  unityPath (prefab/GameObject > Component > field).
- Empty arrays are fine when a category has no findings.
""" + GROUNDING_RULES

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


# ─── Human session synthesis ──────────────────────────────────────────────────

PLAYTEST_SYNTHESIS_PROMPT = """\
You summarize notes from REAL human playtest sessions for the game's designer.
Write plain text — no JSON, no headings — at most 8 short lines, each starting with "- ":
- Problems several testers hit (say how many sessions mention each).
- Where testers were confused about what to do (comprehension issues).
- What testers enjoyed or kept playing for.
Only use what the notes say. Never invent tester reactions, numbers, or fixes.
If the notes are too thin to show a pattern, say so in one line.
"""


def build_synthesis_prompt(notes: list[str]) -> str:
    joined = "\n\n".join(f"Session {i}:\n{note[:2000]}" for i, note in enumerate(notes, start=1))
    return f"Playtest session notes:\n\n{joined[:12000]}\n\nSummarize them now."
