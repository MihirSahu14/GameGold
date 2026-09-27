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
     "unityPath": "exact Unity location, e.g. 'Enemy prefab > EnemyAI component > moveSpeed field'",
     "nodeId": "optional — the dialogue node id this ties to, when known"}
  ]
}

Rules:
- playthroughLog: up to 10 steps; only steps the design supports. First person,
  in this persona's voice, one sentence each.
- Keep it tight so the JSON is never cut off: summary ≤ 3 sentences; every other
  array ≤ 5 items; each item ≤ 2 sentences.
- Stay strictly within what the design describes — flag gaps as issues instead
  of inventing content.
- Every balanceSuggestion needs a specific, actionable fix and a plausible
  unityPath (prefab/GameObject > Component > field), or the node id it concerns.
- When a finding ties to a specific dialogue node, prefix its text with
  "[nodeId] " so the designer can jump to it.
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
    # Narrative personas (gap 47) — the classic personas talk about exploits,
    # economy and movement, which don't apply to a story-driven game.
    "skimmer": (
        "A skimmer: clicks through dialogue fast, skips or half-reads text, picks "
        "choices on gut instinct. Does the story still land if you don't read closely?"
    ),
    "careful_reader": (
        "A careful reader: reads every line, tracks tone and continuity, notices "
        "contradictions, dropped threads, or moments the voice breaks character."
    ),
    "choice_agonizer": (
        "A choice-agonizer: reads every option before picking, worries about the "
        "'right' answer, and notices when a choice reads as labeled good/bad, or "
        "when a choice was actually meaningless (all paths converge)."
    ),
    "replayer": (
        "A replayer: plays the story twice, picking opposite choices the second "
        "time. Checks whether endings actually differ and feel earned, or whether "
        "the branching was cosmetic."
    ),
}

NARRATIVE_PERSONAS: list[str] = ["skimmer", "careful_reader", "choice_agonizer", "replayer"]
CLASSIC_PERSONAS: list[str] = ["casual", "hardcore", "speedrunner", "completionist"]

PERSONA_META: dict[str, dict[str, str]] = {
    "casual": {"icon": "🛋️", "blurb": "Short sessions, skips tutorials, hates difficulty walls"},
    "hardcore": {"icon": "⚔️", "blurb": "Min-maxes stats, hunts exploits, breaks the economy"},
    "speedrunner": {"icon": "⏱️", "blurb": "Skips everything, abuses movement, finds sequence breaks"},
    "completionist": {"icon": "🗺️", "blurb": "Does everything, tests every interaction, finds dead ends"},
    "skimmer": {"icon": "⏩", "blurb": "Clicks through fast, skips text — does the story still land?"},
    "careful_reader": {"icon": "🔍", "blurb": "Reads everything, notices contradictions and tone breaks"},
    "choice_agonizer": {"icon": "🤔", "blurb": "Agonizes over choices, flags labeled or meaningless ones"},
    "replayer": {"icon": "🔁", "blurb": "Plays twice with opposite choices — do endings really differ?"},
}


def personas_for_genre(genre: str) -> list[str]:
    return NARRATIVE_PERSONAS if genre in ("narrative", "visual-novel") else CLASSIC_PERSONAS


def build_playtest_prompt(
    persona: str,
    design_context: str,
    systems_summary: str,
    concept_summary: str = "",
    is_narrative: bool = False,
) -> str:
    persona_text = PERSONA_DESCRIPTIONS.get(persona, PERSONA_DESCRIPTIONS["casual"])

    systems_section = (
        f"\nSystems graph (entities, mechanics, relationships):\n{systems_summary}\n"
        if systems_summary
        else ""
    )
    concept_section = f"\nConcept card:\n{concept_summary}\n" if concept_summary else ""

    label = "Narrative walkthrough (nodes, choices, branches, endings)" if is_narrative else "Game design document (summary)"
    narrative_rules = (
        """
This is a narrative game — judge it as a reader, not a systems player. Focus
predicted issues on: whether the story reads well at this persona's pace,
choice legibility (does a choice read as obviously "good"/"bad", or feel
meaningless because all paths converge?), pacing between story beats, whether
endings are legible and earned, and whether anything violates a stated design
pillar or "won't do". Tie each issue to a node id in brackets where possible,
e.g. "[n12] ...". Softlocks means "the story appears to dead-end or lose
state consistency", not a physical stuck spot.
"""
        if is_narrative
        else ""
    )

    return f"""\
Simulate a playthrough of this game as the following persona:

Persona: {persona}
{persona_text}
{narrative_rules}
{label}:
{design_context or "(no design material available — flag this as a major gap)"}
{systems_section}{concept_section}
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
