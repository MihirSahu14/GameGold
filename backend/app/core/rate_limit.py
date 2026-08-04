from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def user_or_ip_key(request: Request) -> str:
    """Rate-limit key: authenticated user id when available, else client IP.

    `request.state.user_id` is only set once `get_current_user` runs, so
    unauthenticated routes (register/login) always fall back to IP — their
    existing brute-force limits are unaffected.
    """
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


limiter = Limiter(key_func=user_or_ip_key, headers_enabled=True)

LLM_RATE_LIMIT = "20/minute"
