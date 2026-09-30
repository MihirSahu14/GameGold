"""Users' own LLM keys: encryption at rest and scrubbing keys out of error text."""
import base64
import hashlib
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
    # Any long random string works (e.g. Render's "Generate"): the Fernet key is derived from it.
    secret = settings.llm_key_secret
    if len(secret) < 32:
        raise OwnKeysNotConfigured()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def encrypt_key(key: str) -> str:
    return _fernet().encrypt(key.encode()).decode()


def decrypt_key(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def scrub(text: str, key: str | None = None) -> str:
    """Remove the given key, and anything shaped like a provider key, from text."""
    if key:
        text = text.replace(key, "***")
    return _TOKEN_RE.sub("***", text)
