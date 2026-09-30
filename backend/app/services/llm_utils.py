"""
Shared LLM helpers — single completion entrypoint plus robust output parsing.
Smaller dev models (Groq Llama) sometimes wrap JSON in markdown fences or add
prose around it, so json.loads alone is too brittle.
"""
import asyncio
import json
import logging
import re
from contextvars import ContextVar
from datetime import datetime, timezone

import litellm

from app.config import settings
from app.db.mongodb import get_db
from app.services.llm_keys import PROVIDERS, decrypt_key, scrub

LLM_TIMEOUT_SECONDS = 90

logger = logging.getLogger("app.llm")

# Set by get_current_user; complete() uses the user's own key when they have one.
current_llm_user: ContextVar[dict | None] = ContextVar("current_llm_user", default=None)


class TrialBudgetExhausted(Exception):
    """Today's global free-trial budget on GameGold's key is spent (-> HTTP 402)."""


def strip_html(text: str) -> str:
    """Remove HTML tags (TipTap stores sections as HTML after edits)."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def _list(value) -> list:
    """LLM list fields sometimes come back as a string/dict/null — treat those as empty."""
    return value if isinstance(value, list) else []


def _as_dict(parsed, text: str) -> dict:
    if not isinstance(parsed, dict):
        raise ValueError(f"LLM returned JSON that is not an object: {text[:200]!r}")
    return parsed


def _repair_json_strings(text: str) -> str:
    """Escape literal newlines/tabs inside JSON string values.
    LLMs (especially smaller ones) sometimes emit raw newlines inside strings
    instead of the \\n sequences that JSON requires."""
    result: list[str] = []
    in_string = False
    escaped = False
    for ch in text:
        if escaped:
            result.append(ch)
            escaped = False
        elif ch == "\\" and in_string:
            result.append(ch)
            escaped = True
        elif ch == '"':
            result.append(ch)
            in_string = not in_string
        elif in_string and ch == "\n":
            result.append("\\n")
        elif in_string and ch == "\r":
            result.append("\\r")
        elif in_string and ch == "\t":
            result.append("\\t")
        else:
            result.append(ch)
    return "".join(result)


def extract_json(text: str) -> dict:
    """
    Parse a JSON object out of LLM output. Tolerates markdown fences,
    surrounding prose, and literal newlines inside string values.
    Raises ValueError when no valid object is found.
    """
    candidate = text.strip()

    # Strip ```json ... ``` fences if present
    fence = re.search(r"```(?:json)?\s*(.*?)```", candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1).strip()

    # Try plain parse first, then with literal-newline repair
    for attempt in (candidate, _repair_json_strings(candidate)):
        try:
            return _as_dict(json.loads(attempt), text)
        except json.JSONDecodeError:
            pass

    # Fall back to the outermost { ... } span (with and without repair)
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end > start:
        span = candidate[start : end + 1]
        for attempt in (span, _repair_json_strings(span)):
            try:
                return _as_dict(json.loads(attempt), text)
            except json.JSONDecodeError:
                pass

    raise ValueError(f"LLM returned invalid JSON: {text[:200]!r}")


def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int, model: str, api_key: str):
    return litellm.completion(
        model=model,
        api_key=api_key,
        max_tokens=max_tokens,
        timeout=LLM_TIMEOUT_SECONDS,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )


def _text(response) -> str:
    return response.choices[0].message.content or ""


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def trial_spent_usd() -> float:
    doc = await get_db().llm_budget.find_one({"_id": _today()})
    return float(doc["spent_usd"]) if doc else 0.0


async def _record_trial_cost(response) -> None:
    try:
        cost = float(litellm.completion_cost(completion_response=response))
    except Exception:
        logger.warning("Could not price trial LLM call for model=%s; recording $0", settings.llm_model)
        cost = 0.0
    await get_db().llm_budget.update_one(
        {"_id": _today()}, {"$inc": {"spent_usd": cost, "calls": 1}}, upsert=True
    )


async def call_with_key(system_prompt: str, user_prompt: str, max_tokens: int, provider: str, model: str, key: str) -> str:
    """Call on a user's own key. Errors never fall back to the trial key and never carry the key."""
    try:
        response = await asyncio.to_thread(_call_llm, system_prompt, user_prompt, max_tokens, model, key)
    except Exception as e:
        # from None: the original exception text may contain the key
        raise ValueError(f"Your {PROVIDERS.get(provider, provider)} key was rejected: {scrub(str(e), key)[:300]}") from None
    return _text(response)


async def complete(system_prompt: str, user_prompt: str, max_tokens: int = 1500) -> str:
    """One LLM call via LiteLLM, run off the event loop thread so it doesn't block
    other requests for the duration of the (often multi-second) call.
    Users with their own key run on it, unmetered; everyone else runs on GameGold's
    key within the daily trial budget (TrialBudgetExhausted -> 402).
    Provider/network/timeout errors surface as ValueError so routers return 502."""
    llm = (current_llm_user.get() or {}).get("llm")
    if llm:
        try:
            key = decrypt_key(llm["key_encrypted"])
        except Exception:
            raise ValueError("Your saved API key can't be read on this server. Re-enter it in Settings.") from None
        return await call_with_key(system_prompt, user_prompt, max_tokens, llm["provider"], llm["model"], key)

    # ponytail: check-then-spend — concurrent in-flight calls can overshoot the cap by
    # their cost (cents). Upgrade path if that matters: reserve an estimate, then settle.
    if await trial_spent_usd() >= settings.trial_daily_budget_usd:
        raise TrialBudgetExhausted()
    try:
        response = await asyncio.to_thread(
            _call_llm, system_prompt, user_prompt, max_tokens, settings.llm_model, settings.llm_api_key
        )
    except Exception as e:
        raise ValueError(f"LLM call failed: {scrub(str(e), settings.llm_api_key)}") from e
    await _record_trial_cost(response)
    return _text(response)
