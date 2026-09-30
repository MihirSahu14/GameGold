"""Users' own LLM keys: encryption at rest and scrubbing keys out of error text."""
import re

from cryptography.fernet import Fernet

from app.config import settings

# LiteLLM prefix -> display name. Stored models are "<prefix>/<model>".
PROVIDERS = {
    "openrouter": "OpenRouter",
    "anthropic": "Anthropic",
    "openai": "OpenAI",
    "gemini": "Gemini",
    "groq": "Groq",
}

# sk-… (OpenAI/Anthropic/OpenRouter), AIza… (Google), gsk_… (Groq)
_TOKEN_RE = re.compile(r"(sk-[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{16,}|gsk_[A-Za-z0-9]{16,})")


class OwnKeysNotConfigured(Exception):
    """LLM_KEY_SECRET is missing or malformed on this server."""


def _fernet() -> Fernet:
    try:
        return Fernet(settings.llm_key_secret.encode())
    except ValueError as exc:  # empty or not a Fernet key
        raise OwnKeysNotConfigured() from exc


def encrypt_key(key: str) -> str:
    return _fernet().encrypt(key.encode()).decode()


def decrypt_key(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def scrub(text: str, key: str | None = None) -> str:
    """Remove the given key, and anything shaped like a provider key, from text."""
    if key:
        text = text.replace(key, "***")
    return _TOKEN_RE.sub("***", text)
