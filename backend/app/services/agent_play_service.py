"""Agent playthroughs of the live build: one vision call per step, one report call per agent."""
import logging
import re
from typing import Optional

import litellm

from app.models.playtest import AgentInputAction, AgentStepOut
from app.prompts.agent_play_prompt import (
    ACT_MAX_ACTIONS,
    ACT_MAX_HOLD_MS,
    ACT_MAX_TOTAL_MS,
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
# max_steps counts acting steps only; waits are free up to this many total steps per agent.
TOTAL_STEPS_FACTOR = 2
ACTING = ("click", "key", "act")

# Rough per-call token sizes for the cost estimate (a 1024px JPEG is ~1,500 tokens).
STEP_TOKENS = (1700, 150)
REPORT_TOKENS = (3000, 600)


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _ms(v) -> Optional[int]:
    """A hold/wait length clamped to 0..ACT_MAX_HOLD_MS; None when it isn't a number."""
    return min(max(round(v), 0), ACT_MAX_HOLD_MS) if _num(v) else None


def parse_act(raw, scale) -> Optional[list[AgentInputAction]]:
    """The model's "actions" list -> bridge browser.act inputs. Bad items are skipped; None only when nothing usable is left.
    Lenient on sizes: extra actions are dropped, holds/waits clamped, and anything past the 3 s total trimmed."""
    if not isinstance(raw, list) or not raw:
        return None
    out: list[AgentInputAction] = []
    total = 0
    for item in raw[:ACT_MAX_ACTIONS]:
        # ponytail: a bad item is skipped, not fatal — one odd key shouldn't cost the agent its turn
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind in ("key", "keys"):
            keys = [item.get("key")] if kind == "key" else item.get("keys")
            if not isinstance(keys, list) or not keys:
                continue
            keys = [k for k in (normalize_key(k) for k in keys) if k]
            if not keys:
                continue
            hold = _ms(item.get("holdMs", 100))
            if hold is None:
                hold = 100
            hold = min(hold, ACT_MAX_TOTAL_MS - total)
            total += hold
            out.append(AgentInputAction(type=kind, hold_ms=hold, **({"key": keys[0]} if kind == "key" else {"keys": list(dict.fromkeys(keys))})))
        elif kind == "wait":
            ms = _ms(item.get("ms"))
            if ms is None:
                continue
            ms = min(ms, ACT_MAX_TOTAL_MS - total)
            total += ms
            out.append(AgentInputAction(type="wait", ms=ms))
        elif kind in ("mouseMove", "click", "mouseDown", "mouseUp"):
            x, y = item.get("x"), item.get("y")
            if x is None and y is None and kind in ("mouseDown", "mouseUp"):
                out.append(AgentInputAction(type=kind))  # press/release where the mouse is
                continue
            if not (_num(x) and _num(y)):
                continue
            vx, vy = scale(x, y)
            out.append(AgentInputAction(type=kind, x=vx, y=vy))
    return out or None


log = logging.getLogger(__name__)

# The model's spelling -> the bridge's key names (case-insensitive). Anything else must already be allowed.
KEY_ALIASES = {"return": "Enter", "enter": "Enter", "space": "Space", "spacebar": "Space", " ": "Space",
               "esc": "Escape", "escape": "Escape", "shift": "Shift",
               "up": "ArrowUp", "down": "ArrowDown", "left": "ArrowLeft", "right": "ArrowRight",
               "arrowup": "ArrowUp", "arrowdown": "ArrowDown", "arrowleft": "ArrowLeft", "arrowright": "ArrowRight"}


def normalize_key(key) -> Optional[str]:
    if not isinstance(key, str):
        return None
    k = KEY_ALIASES.get(key.strip().lower(), key.strip())
    if len(k) == 1 and k.isalpha():
        k = k.lower()
    return k if k in ALLOWED_KEYS else None


def _loose_fields(text: str) -> Optional[dict]:
    """Broken JSON (e.g. unescaped quotes inside the note) -> the simple fields, by pattern. No act lists."""
    m = re.search(r'"action"\s*:\s*"(\w+)"', text)
    if not m:
        return None
    data: dict = {"action": m.group(1)}
    for field in ("key", "stopReason"):
        f = re.search(rf'"{field}"\s*:\s*"([^"]*)"', text)
        if f:
            data[field] = f.group(1)
    for field in ("x", "y"):
        f = re.search(rf'"{field}"\s*:\s*(-?\d+(?:\.\d+)?)', text)
        if f:
            data[field] = float(f.group(1))
    pair = re.search(r'"x"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,', text)
    if pair and "y" not in data:  # '"x": 517, 281' — the model dropped the "y" key
        data["y"] = float(pair.group(2))
    note = re.search(r'"note"\s*:\s*"(.*?)"\s*(?:,\s*"\w+"\s*:|\}\s*$)', text, re.S)
    data["note"] = note.group(1) if note else ""
    return data


def parse_step(text: str, sw: int, sh: int, vw: int, vh: int) -> Optional[AgentStepOut]:
    """Model JSON -> action in viewport coords. None when the answer isn't usable."""
    try:
        data = extract_json(text)
    except ValueError:
        data = _loose_fields(text)
        if data is None:
            return None
    action = data.get("action")
    note = str(data.get("note") or "")[:300]

    def scale(x: float, y: float) -> tuple[int, int]:
        # Screenshot pixels -> viewport pixels, clamped onto the page.
        return min(max(round(x * vw / sw), 0), vw - 1), min(max(round(y * vh / sh), 0), vh - 1)

    if action == "click":
        x, y = data.get("x"), data.get("y")
        if not (_num(x) and _num(y)):
            return None
        vx, vy = scale(x, y)
        return AgentStepOut(action="click", x=vx, y=vy, note=note)
    if action == "act":
        actions = parse_act(data.get("actions"), scale)
        return AgentStepOut(action="act", actions=actions, note=note) if actions else None
    if action == "key":
        key = normalize_key(data.get("key"))
        if key is None:
            return None
        return AgentStepOut(action="key", key=key, note=note)
    if action in ("wait", "note", "think"):  # "note"/"think": the model only described the screen
        return AgentStepOut(action="wait", note=note)
    if action == "stop":
        return AgentStepOut(action="stop", note=note, stop_reason=str(data.get("stopReason") or "")[:300] or "Gave up")
    return None


async def agent_step(agent: str, custom: str, actions_used: int, max_steps: int, jpeg_b64: str,
                     sw: int, sh: int, vw: int, vh: int, recent_notes: list[str],
                     step_mode: bool = False) -> Optional[AgentStepOut]:
    prompt = build_step_prompt(agent, custom, actions_used, max_steps, sw, sh, recent_notes, step_mode)
    text = await complete_vision(AGENT_STEP_SYSTEM_PROMPT, prompt, jpeg_b64, max_tokens=300)
    step = parse_step(text, sw, sh, vw, vh)
    if step is None:
        log.warning("agent step: unusable model answer: %r", text[:500])
    return step


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
