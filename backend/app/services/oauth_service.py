"""Provider HTTP calls for Google + GitHub sign-in (authorization-code flow)."""
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.config import settings

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"

PROVIDERS = {
    "google": {"authorize": GOOGLE_AUTHORIZE_URL, "token": GOOGLE_TOKEN_URL, "scope": "openid email profile"},
    "github": {"authorize": GITHUB_AUTHORIZE_URL, "token": GITHUB_TOKEN_URL, "scope": "read:user user:email"},
}

TIMEOUT_SECONDS = 10


@dataclass
class Identity:
    provider_id: str
    email: str | None  # only ever a *verified* email; None if the provider has none
    name: str


def credentials(provider: str) -> tuple[str, str]:
    return getattr(settings, f"{provider}_client_id"), getattr(settings, f"{provider}_client_secret")


def redirect_uri(provider: str) -> str:
    return f"{settings.api_public_url}/auth/oauth/{provider}/callback"


def authorize_url(provider: str, state: str) -> str:
    params = {
        "client_id": credentials(provider)[0],
        "redirect_uri": redirect_uri(provider),
        "scope": PROVIDERS[provider]["scope"],
        "state": state,
    }
    if provider == "google":
        params["response_type"] = "code"
    return f"{PROVIDERS[provider]['authorize']}?{urlencode(params)}"


async def fetch_identity(provider: str, code: str) -> Identity:
    """Exchange the code and fetch the user. Raises on any provider/network error."""
    client_id, client_secret = credentials(provider)
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        token_resp = await client.post(
            PROVIDERS[provider]["token"],
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri(provider),
                "grant_type": "authorization_code",
            },
            headers={"Accept": "application/json"},
        )
        token_resp.raise_for_status()
        # GitHub reports bad codes as 200 + {"error": ...}; the KeyError is the failure.
        auth = {"Authorization": f"Bearer {token_resp.json()['access_token']}"}

        if provider == "google":
            info = (await client.get(GOOGLE_USERINFO_URL, headers=auth)).raise_for_status().json()
            verified = info.get("email_verified") in (True, "true")
            return Identity(str(info["sub"]), info.get("email") if verified else None, info.get("name") or "")

        gh = {**auth, "Accept": "application/vnd.github+json"}
        user = (await client.get(GITHUB_USER_URL, headers=gh)).raise_for_status().json()
        emails = (await client.get(GITHUB_EMAILS_URL, headers=gh)).raise_for_status().json()
        email = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None)
        return Identity(str(user["id"]), email, user.get("login") or user.get("name") or "")
