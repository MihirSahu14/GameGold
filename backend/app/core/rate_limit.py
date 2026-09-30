from fastapi import Request
from slowapi import Limiter


def client_ip(request: Request) -> str:
    """Client IP for rate-limit keys: the LEFT-most X-Forwarded-For entry, else the socket peer.

    Render (behind Cloudflare) sets the first X-Forwarded-For entry to the real
    client IP — Render staff, marked complete 2021-05-28:
    https://feedback.render.com/features/p/send-the-correct-xforwardedfor
    Render's own guide just says "read the client IP from x-forwarded-for":
    https://render.com/articles/how-render-handles-ddos-attacks
    The right-most entry would be a Cloudflare/Render proxy hop, i.e. one shared
    bucket for every user. Same host uvicorn --forwarded-allow-ips='*' picks for
    request.client; reading the header here keeps it independent of that flag.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "127.0.0.1"


def user_or_ip_key(request: Request) -> str:
    """Rate-limit key: authenticated user id when available, else client IP.

    `request.state.user_id` is only set once `get_current_user` runs, so
    unauthenticated routes (register/login) always fall back to IP — their
    existing brute-force limits are unaffected.
    """
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return client_ip(request)


limiter = Limiter(key_func=user_or_ip_key, headers_enabled=True)

LLM_RATE_LIMIT = "20/minute"
