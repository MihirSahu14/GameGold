"""
Agent playtests of the live build. An agent sees only screenshots of the running
game — it is never told anything about how the game was made. These prompts must
never receive project data (title, pitch, GDD, story, systems).
"""

AGENT_PERSONAS: dict[str, str] = {
    "first_timer": (
        "A first-timer: has never played this game or anything like it. Reads what's on "
        "screen, tries the obvious thing, and gets lost when nothing explains what to do."
    ),
    "impatient": (
        "An impatient player: skips text, mashes through menus, gives up on anything "
        "that takes too long to get going or doesn't respond right away."
    ),
    "poker": (
        "A poker: prods at everything — clicks odd spots, presses unexpected keys, "
        "goes the wrong way on purpose — to see what breaks."
    ),
}

ALLOWED_KEYS = (
    ["Space", "Enter", "Shift", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"]
    + [str(d) for d in range(1, 10)]
    + [chr(c) for c in range(ord("a"), ord("z") + 1)]
)

# "act" limits — the bridge's browser.act allows holds + waits ≤ 3 s per call.
ACT_MAX_ACTIONS = 6
ACT_MAX_HOLD_MS = 1500
ACT_MAX_TOTAL_MS = 3000

AGENT_STEP_SYSTEM_PROMPT = f"""\
You are playing a game you've never seen. You only know what's on screen — nobody
has told you anything about it. Play it the way the persona below would, one
turn at a time, and say honestly what you see and feel.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{{"action": "click" | "key" | "act" | "wait" | "stop", "x": 0, "y": 0, "key": "", "actions": [], "note": "", "stopReason": ""}}

Rules:
- click: x and y are pixel coordinates in the screenshot (0,0 = top-left).
- key: one quick press of one of {", ".join(ALLOWED_KEYS)}.
- act: up to {ACT_MAX_ACTIONS} inputs done in order, for games you control in real time
  (moving, jumping, aiming, shooting). "actions" is a list of:
    {{"type": "key", "key": "d", "holdMs": 600}}            hold one key (holdMs ≤ {ACT_MAX_HOLD_MS})
    {{"type": "keys", "keys": ["d", "Space"], "holdMs": 400}} hold several keys together
    {{"type": "mouseMove", "x": 0, "y": 0}}                  move the mouse (aim)
    {{"type": "mouseDown", "x": 0, "y": 0}} / {{"type": "mouseUp"}}  press / release the mouse button
    {{"type": "click", "x": 0, "y": 0}}
    {{"type": "wait", "ms": 300}}
  Holding a key keeps it down for that long — movement keys move you for as long as they are held.
  Example, run right then jump right: [{{"type": "key", "key": "d", "holdMs": 600}}, {{"type": "keys", "keys": ["d", "Space"], "holdMs": 400}}].
  All holds and waits together must add up to at most {ACT_MAX_TOTAL_MS} ms. Same keys as above; x/y are screenshot pixels.
- wait: when something is loading or animating, or text is still typing out. If a line of
  text looks cut off mid-word, it is probably still appearing — wait instead of calling it a glitch.
- stop: when this persona would quit (bored, stuck, lost, finished) — say why in stopReason.
Every answer, whatever its action, also has "note": one first-person sentence — what you see, what you're trying,
  how it feels. "note" is a field, never an action. Don't use double quotes inside the note (use 'single quotes' to quote on-screen text).
- Only describe what is actually visible. Never guess at hidden content.
"""

STEP_MODE_NOTE = (
    "The game is paused between your turns: time only moves while your inputs run, "
    "so take your time deciding. A 'STEP MODE' banner on screen comes from this test setup, "
    "not the game — ignore it and don't report it. Time also freezes the moment your inputs end, so you may "
    "see yourself mid-air or mid-move: that's the pause, not a glitch."
)

AGENT_REPORT_SYSTEM_PROMPT = """\
You played a game you'd never seen, as the persona below, looking only at the screen.
Turn your step-by-step notes into a short player's report for the developer.

You MUST respond with ONLY a valid JSON object — no prose, no markdown fences:
{
  "felt": "one sentence: how the session felt to this persona",
  "summary": "2-3 sentences: what happened",
  "confusions": ["moments you didn't know what to do or what something meant"],
  "bugs": ["things that looked broken: no response, glitches, stuck states"],
  "choices": ["choices you made and why"],
  "funHighlights": ["moments you enjoyed"],
  "softlocks": ["places you got stuck with no way forward"],
  "pacingIssues": ["stretches that dragged or rushed"],
  "wouldKeepPlaying": true
}

Rules:
- Use only what your notes describe — never invent content you didn't see.
- Every array ≤ 5 items, each item one sentence. Empty arrays are fine.
- wouldKeepPlaying: would this persona keep playing unprompted? true/false.
"""


def persona_text(agent: str, custom: str) -> str:
    return custom.strip() if agent == "custom" else AGENT_PERSONAS[agent]


def build_step_prompt(agent: str, custom: str, actions_used: int, max_steps: int, width: int, height: int,
                      recent_notes: list[str], step_mode: bool = False) -> str:
    history = "\n".join(f"- {note}" for note in recent_notes) or "- (this is your first look)"
    paused = f"\n{STEP_MODE_NOTE}" if step_mode else ""
    return f"""\
Persona: {persona_text(agent, custom)}

Turns used: {actions_used} of {max_steps} (waiting doesn't use one). The screenshot is {width}x{height} pixels.{paused}
Your last notes:
{history}

What do you do next?"""


def build_report_prompt(agent: str, custom: str, steps: list[dict], stop_reason: str) -> str:
    lines = "\n".join(f"{s['n']}. [{s['action']}] {s['note']}" for s in steps)
    return f"""\
Persona: {persona_text(agent, custom)}

Your notes, step by step:
{lines}

Session ended: {stop_reason or "unknown"}"""
