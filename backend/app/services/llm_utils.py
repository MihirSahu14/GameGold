"""
Shared LLM helpers — single completion entrypoint plus robust output parsing.
Smaller dev models (Groq Llama) sometimes wrap JSON in markdown fences or add
prose around it, so json.loads alone is too brittle.
"""
import asyncio
import json
import re

import litellm

from app.config import settings

LLM_TIMEOUT_SECONDS = 90


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


def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    response = litellm.completion(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        max_tokens=max_tokens,
        timeout=LLM_TIMEOUT_SECONDS,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content or ""


async def complete(system_prompt: str, user_prompt: str, max_tokens: int = 1500) -> str:
    """One LLM call via LiteLLM, run off the event loop thread so it doesn't block
    other requests for the duration of the (often multi-second) call.
    Provider/network/timeout errors surface as ValueError so routers return 502."""
    try:
        return await asyncio.to_thread(_call_llm, system_prompt, user_prompt, max_tokens)
    except Exception as e:
        raise ValueError(f"LLM call failed: {e}") from e
