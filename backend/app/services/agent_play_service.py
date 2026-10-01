"""Agent playthroughs of the live build: one vision call per step, one report call per agent."""
from typing import Optional

import litellm

from app.models.playtest import AgentStepOut
from app.prompts.agent_play_prompt import (
    AGENT_REPORT_SYSTEM_PROMPT,
    AGENT_STEP_SYSTEM_PROMPT,
    ALLOWED_KEYS,
    build_report_prompt,
    build_step_prompt,
)
from app.services.llm_utils import _list, complete, complete_vision, extract_json

# Tunable limits: own key vs GameGold's free trial key.
OWN_KEY_MAX_STEPS = 40
TRIAL_MAX_STEPS = 15
TRIAL_AGENTS = ["first_timer"]

# Rough per-call token sizes for the cost estimate (a 1024px JPEG is ~1,500 tokens).
STEP_TOKENS = (1700, 150)
REPORT_TOKENS = (3000, 600)


def parse_step(text: str, sw: int, sh: int, vw: int, vh: int) -> Optional[AgentStepOut]:
    """Model JSON -> action in viewport coords. None when the answer isn't usable."""
    try:
        data = extract_json(text)
    except ValueError:
        return None
    action = data.get("action")
    note = str(data.get("note") or "")[:300]
    if action == "click":
        x, y = data.get("x"), data.get("y")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (x, y)):
            return None
        # Screenshot pixels -> viewport pixels, clamped onto the page.
        vx = min(max(round(x * vw / sw), 0), vw - 1)
        vy = min(max(round(y * vh / sh), 0), vh - 1)
        return AgentStepOut(action="click", x=vx, y=vy, note=note)
    if action == "key":
        key = data.get("key")
        if key not in ALLOWED_KEYS:
            return None
        return AgentStepOut(action="key", key=key, note=note)
    if action == "wait":
        return AgentStepOut(action="wait", note=note)
    if action == "stop":
        return AgentStepOut(action="stop", note=note, stop_reason=str(data.get("stopReason") or "")[:300] or "Gave up")
    return None


async def agent_step(agent: str, custom: str, n: int, max_steps: int, jpeg_b64: str,
                     sw: int, sh: int, vw: int, vh: int, recent_notes: list[str]) -> Optional[AgentStepOut]:
    prompt = build_step_prompt(agent, custom, n, max_steps, sw, sh, recent_notes)
    text = await complete_vision(AGENT_STEP_SYSTEM_PROMPT, prompt, jpeg_b64, max_tokens=300)
    return parse_step(text, sw, sh, vw, vh)


def _strs(value) -> list[str]:
    return [str(v)[:500] for v in _list(value)][:8]


async def agent_report(agent: str, custom: str, steps: list[dict], stop_reason: str) -> dict:
    text = await complete(AGENT_REPORT_SYSTEM_PROMPT, build_report_prompt(agent, custom, steps, stop_reason), max_tokens=1200)
    data = extract_json(text)
    keep = data.get("wouldKeepPlaying")
    return {
        "felt": str(data.get("felt") or "")[:500],
        "summary": str(data.get("summary") or "")[:2000],
        "confusions": _strs(data.get("confusions")),
        "bugs": _strs(data.get("bugs")),
        "choices": _strs(data.get("choices")),
        "fun_highlights": _strs(data.get("funHighlights")),
        "softlocks": _strs(data.get("softlocks")),
        "pacing_issues": _strs(data.get("pacingIssues")),
        "would_keep_playing": keep if isinstance(keep, bool) else None,
    }


def estimate_usd(model: str, agents: int, steps: int) -> Optional[float]:
    """Cost from LiteLLM's price table; None when the model can't be priced."""
    try:
        step = sum(litellm.cost_per_token(model=model, prompt_tokens=STEP_TOKENS[0], completion_tokens=STEP_TOKENS[1]))
        report = sum(litellm.cost_per_token(model=model, prompt_tokens=REPORT_TOKENS[0], completion_tokens=REPORT_TOKENS[1]))
    except Exception:
        return None
    return round(agents * (steps * step + report), 4)
