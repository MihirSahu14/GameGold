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


def strip_html(text: str) -> str:
    """Remove HTML tags (TipTap stores sections as HTML after edits)."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def extract_json(text: str) -> dict:
    """
    Parse a JSON object out of LLM output. Tolerates markdown fences and
    surrounding prose. Raises ValueError when no valid object is found.
    """
    candidate = text.strip()

    # Strip ```json ... ``` fences if present
    fence = re.search(r"```(?:json)?\s*(.*?)```", candidate, re.DOTALL)
    if fence:
        candidate = fence.group(1).strip()

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Fall back to the outermost { ... } span
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(candidate[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"LLM returned invalid JSON: {text[:200]!r}")


def _call_llm(system_prompt: str, user_prompt: str, max_tokens: int) -> str:
    response = litellm.completion(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    return response.choices[0].message.content or ""


async def complete(system_prompt: str, user_prompt: str, max_tokens: int = 1500) -> str:
    """One LLM call via LiteLLM, run off the event loop thread so it doesn't block
    other requests for the duration of the (often multi-second) call."""
    return await asyncio.to_thread(_call_llm, system_prompt, user_prompt, max_tokens)
