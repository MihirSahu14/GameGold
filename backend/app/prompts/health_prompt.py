"""Smallest possible LLM round-trip for GET /health/llm (catches a retired model)."""

HEALTH_SYSTEM_PROMPT = "You are a health check. Reply with the single word: ok"
HEALTH_USER_PROMPT = "ping"
