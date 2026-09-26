"""Google + GitHub sign-in (server-side authorization-code flow). httpx is mocked."""
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from bson import ObjectId
from unittest.mock import AsyncMock, MagicMock

from app.config import settings

FRONTEND = "http://localhost:3000"


@pytest.fixture(autouse=True)
def oauth_settings(monkeypatch):
    for key in ("google_client_id", "google_client_secret", "github_client_id", "github_client_secret"):
        monkeypatch.setattr(settings, key, f"test-{key}")
    monkeypatch.setattr(settings, "frontend_url", FRONTEND)
    monkeypatch.setattr(settings, "api_public_url", "http://localhost:8000")


@pytest.fixture
def users(mock_db):
    """dict-backed db.users supporting the queries the OAuth flow makes."""
    store: dict[ObjectId, dict] = {}

    def matches(doc, query):
        for key, value in query.items():
            cur = doc
            for part in key.split("."):
                cur = cur.get(part) if isinstance(cur, dict) else None
            if cur != value:
                return False
        return True

    async def find_one(query):
        return next((dict(d) for d in store.values() if matches(d, query)), None)

    async def insert_one(doc):
        _id = ObjectId()
        store[_id] = {**doc, "_id": _id}
        return MagicMock(inserted_id=_id)

    async def update_one(query, update, upsert=False):
        for d in store.values():
            if matches(d, query):
                for key, value in update.get("$set", {}).items():
                    parts = key.split(".")
                    target = d
                    for part in parts[:-1]:
                        target = target.setdefault(part, {})
                    target[parts[-1]] = value
                for key in update.get("$unset", {}):
                    d.pop(key, None)
                return

    mock_db.users.find_one = AsyncMock(side_effect=find_one)
    mock_db.users.insert_one = AsyncMock(side_effect=insert_one)
    mock_db.users.update_one = AsyncMock(side_effect=update_one)
    mock_db.refresh_tokens.update_many = AsyncMock()
    return store


@pytest.fixture(autouse=True)
def codes(mock_db):
    """list-backed db.oauth_codes supporting the atomic single-use claim."""
    store: list[dict] = []

    async def insert_one(doc):
        store.append(dict(doc))

    async def find_one_and_update(query, update):
        for d in store:
            if (
                d["code_hash"] == query["code_hash"]
                and d["used"] == query["used"]
                and d["expires_at"] > query["expires_at"]["$gt"]
            ):
                before = dict(d)
                d.update(update["$set"])
                return before
        return None

    mock_db.oauth_codes.insert_one = AsyncMock(side_effect=insert_one)
    mock_db.oauth_codes.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
    return store


def mock_provider(monkeypatch, routes: dict):
    """Route httpx.AsyncClient requests by URL to (status, json) tuples or an exception."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request):
        seen.append(request)
        url = str(request.url).split("?")[0]
        result = routes[url]
        if isinstance(result, Exception):
            raise result
        status, body = result
        return httpx.Response(status, json=body)

    real = httpx.AsyncClient

    class FakeClient(real):
        def __init__(self, **kwargs):
            super().__init__(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    return seen


GOOGLE_OK = {
    "https://oauth2.googleapis.com/token": (200, {"access_token": "g-token"}),
    "https://openidconnect.googleapis.com/v1/userinfo": (
        200,
        {"sub": "g-123", "email": "ada@example.com", "email_verified": True, "name": "Ada Lovelace"},
    ),
}


def github_routes(emails):
    return {
        "https://github.com/login/oauth/access_token": (200, {"access_token": "gh-token"}),
        "https://api.github.com/user": (200, {"id": 42, "login": "octocat", "name": "The Octocat"}),
        "https://api.github.com/user/emails": (200, emails),
    }


def start(client, provider):
    return client.get(f"/auth/oauth/{provider}/start", follow_redirects=False)


def callback(client, provider, state="s", code="c"):
    client.cookies.set("gg_oauth_state", "s", path="/auth/oauth")
    return client.get(
        f"/auth/oauth/{provider}/callback", params={"code": code, "state": state}, follow_redirects=False
    )


def signed_in_code(resp) -> str:
    """Callback success = redirect to the frontend exchange page with a one-time code, no cookies."""
    assert resp.status_code in (302, 307)
    loc = resp.headers["location"]
    assert loc.startswith(f"{FRONTEND}/auth/callback?code=")
    assert "gg_session=" not in resp.headers.get("set-cookie", "")
    return parse_qs(urlparse(loc).query)["code"][0]


def exchange(client, code):
    return client.post("/auth/oauth/exchange", json={"code": code})


# ─── start ────────────────────────────────────────────────────────────────────

def test_start_unknown_provider_404(auth_client):
    assert start(auth_client, "facebook").status_code == 404


def test_start_unconfigured_provider_503(auth_client, monkeypatch):
    monkeypatch.setattr(settings, "github_client_secret", "")
    assert start(auth_client, "github").status_code == 503


@pytest.mark.parametrize(
    "provider,host,scope",
    [
        ("google", "accounts.google.com", "openid email profile"),
        ("github", "github.com", "read:user user:email"),
    ],
)
def test_start_redirects_with_state_cookie(auth_client, provider, host, scope):
    resp = start(auth_client, provider)
    assert resp.status_code == 302
    url = urlparse(resp.headers["location"])
    params = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert url.hostname == host
    assert params["client_id"] == f"test-{provider}_client_id"
    assert params["redirect_uri"] == f"http://localhost:8000/auth/oauth/{provider}/callback"
    assert params["scope"] == scope
    cookie = resp.headers["set-cookie"]
    assert f"gg_oauth_state={params['state']}" in cookie
    assert "HttpOnly" in cookie and "Path=/auth/oauth" in cookie and "samesite=lax" in cookie.lower()
    assert "Max-Age=600" in cookie


# ─── callback ─────────────────────────────────────────────────────────────────

def test_callback_state_mismatch_redirects_with_error(auth_client, users, monkeypatch):
    seen = mock_provider(monkeypatch, GOOGLE_OK)
    resp = callback(auth_client, "google", state="wrong")
    assert resp.status_code in (302, 307)
    assert resp.headers["location"] == f"{FRONTEND}/login?error=oauth_state"
    assert seen == []  # never touched the provider
    assert 'gg_oauth_state=""' in resp.headers["set-cookie"]  # cleared


def test_callback_missing_state_cookie_redirects_with_error(auth_client, users):
    resp = auth_client.get(
        "/auth/oauth/google/callback", params={"code": "c", "state": "s"}, follow_redirects=False
    )
    assert resp.headers["location"] == f"{FRONTEND}/login?error=oauth_state"


def test_google_new_user_created_without_password(auth_client, users, monkeypatch):
    mock_provider(monkeypatch, GOOGLE_OK)
    resp = callback(auth_client, "google")
    signed_in_code(resp)
    [user] = users.values()
    assert user["email"] == "ada@example.com"
    assert user["username"] == "AdaLovelace"
    assert user.get("hashed_password") is None
    assert user["oauth"] == {"google": "g-123"}


def test_google_existing_email_is_linked(auth_client, users, mock_db, monkeypatch):
    _id = ObjectId()
    users[_id] = {"_id": _id, "email": "ada@example.com", "username": "ada", "hashed_password": "h"}
    mock_provider(monkeypatch, GOOGLE_OK)
    resp = callback(auth_client, "google")
    signed_in_code(resp)
    assert len(users) == 1
    assert users[_id]["oauth"] == {"google": "g-123"}
    # /auth/register never verified the email, so a pre-registered password could be an
    # attacker's: the provider just proved ownership — drop the password, kill its sessions.
    assert "hashed_password" not in users[_id]
    mock_db.refresh_tokens.update_many.assert_awaited_once_with(
        {"user_id": str(_id), "revoked": False}, {"$set": {"revoked": True}}
    )


def test_link_to_account_bound_to_other_provider_id_is_conflict(auth_client, users, monkeypatch):
    _id = ObjectId()
    users[_id] = {"_id": _id, "email": "ada@example.com", "username": "ada", "oauth": {"google": "g-OTHER"}}
    mock_provider(monkeypatch, GOOGLE_OK)
    resp = callback(auth_client, "google")
    assert resp.headers["location"] == f"{FRONTEND}/login?error=oauth_conflict"
    assert users[_id]["oauth"] == {"google": "g-OTHER"}


def test_provider_email_is_normalized_before_linking(auth_client, users, mock_db, monkeypatch):
    _id = ObjectId()
    users[_id] = {"_id": _id, "email": "ada@example.com", "username": "ada"}
    routes = dict(GOOGLE_OK)
    routes["https://openidconnect.googleapis.com/v1/userinfo"] = (
        200,
        {"sub": "g-123", "email": " Ada@Example.COM ", "email_verified": True, "name": "Ada"},
    )
    mock_provider(monkeypatch, routes)
    signed_in_code(callback(auth_client, "google"))
    assert len(users) == 1
    assert users[_id]["oauth"] == {"google": "g-123"}
    mock_db.refresh_tokens.update_many.assert_not_awaited()  # no password to drop


def test_existing_oauth_id_reused_even_if_email_changed(auth_client, users, monkeypatch):
    _id = ObjectId()
    users[_id] = {"_id": _id, "email": "old@example.com", "username": "ada", "oauth": {"google": "g-123"}}
    mock_provider(monkeypatch, GOOGLE_OK)
    resp = callback(auth_client, "google")
    signed_in_code(resp)
    assert len(users) == 1


def test_google_unverified_email_rejected(auth_client, users, monkeypatch):
    routes = dict(GOOGLE_OK)
    routes["https://openidconnect.googleapis.com/v1/userinfo"] = (
        200,
        {"sub": "g-1", "email": "x@example.com", "email_verified": False},
    )
    mock_provider(monkeypatch, routes)
    resp = callback(auth_client, "google")
    assert resp.headers["location"] == f"{FRONTEND}/login?error=oauth_email"
    assert users == {}


def test_github_happy_path_picks_primary_verified_email(auth_client, users, monkeypatch):
    seen = mock_provider(
        monkeypatch,
        github_routes(
            [
                {"email": "other@example.com", "primary": False, "verified": True},
                {"email": "octo@example.com", "primary": True, "verified": True},
            ]
        ),
    )
    resp = callback(auth_client, "github")
    signed_in_code(resp)
    [user] = users.values()
    assert user["email"] == "octo@example.com"
    assert user["username"] == "octocat"
    assert user["oauth"] == {"github": "42"}
    assert seen[1].headers["authorization"] == "Bearer gh-token"


def test_google_email_verified_as_string_true_is_accepted(auth_client, users, monkeypatch):
    routes = dict(GOOGLE_OK)
    routes["https://openidconnect.googleapis.com/v1/userinfo"] = (
        200,
        {"sub": "g-7", "email": "s@example.com", "email_verified": "true", "name": "Str"},
    )
    mock_provider(monkeypatch, routes)
    signed_in_code(callback(auth_client, "google"))
    [user] = users.values()
    assert user["email"] == "s@example.com"


def test_github_token_exchange_error_redirects_oauth_failed(auth_client, users, monkeypatch):
    routes = github_routes([])
    routes["https://github.com/login/oauth/access_token"] = (200, {"error": "bad_verification_code"})
    mock_provider(monkeypatch, routes)
    resp = callback(auth_client, "github")
    assert resp.headers["location"] == f"{FRONTEND}/login?error=oauth_failed"
    assert users == {}


def test_github_unverified_only_emails_rejected(auth_client, users, monkeypatch):
    mock_provider(
        monkeypatch, github_routes([{"email": "octo@example.com", "primary": True, "verified": False}])
    )
    resp = callback(auth_client, "github")
    assert resp.headers["location"] == f"{FRONTEND}/login?error=oauth_email"
    assert users == {}


@pytest.mark.parametrize(
    "override",
    [
        {"https://oauth2.googleapis.com/token": (400, {"error": "invalid_grant"})},
        {"https://oauth2.googleapis.com/token": (200, {"error": "bad_verification_code"})},
        {"https://openidconnect.googleapis.com/v1/userinfo": httpx.ConnectTimeout("boom")},
    ],
)
def test_provider_error_redirects_oauth_failed(auth_client, users, monkeypatch, override):
    mock_provider(monkeypatch, {**GOOGLE_OK, **override})
    resp = callback(auth_client, "google")
    assert resp.status_code in (302, 307)
    assert resp.headers["location"] == f"{FRONTEND}/login?error=oauth_failed"
    assert users == {}


def test_username_deduped_with_numeric_suffix(auth_client, users, monkeypatch):
    for name in ("AdaLovelace", "AdaLovelace2"):
        _id = ObjectId()
        users[_id] = {"_id": _id, "email": f"{name}@x.com", "username": name}
    mock_provider(monkeypatch, GOOGLE_OK)
    callback(auth_client, "google")
    new = next(u for u in users.values() if u["email"] == "ada@example.com")
    assert new["username"] == "AdaLovelace3"


def test_short_name_falls_back_to_email_local_part(auth_client, users, monkeypatch):
    routes = dict(GOOGLE_OK)
    routes["https://openidconnect.googleapis.com/v1/userinfo"] = (
        200,
        {"sub": "g-9", "email": "zed@example.com", "email_verified": True, "name": "李"},
    )
    mock_provider(monkeypatch, routes)
    callback(auth_client, "google")
    [user] = users.values()
    assert user["username"] == "zed"


# ─── one-time code exchange ──────────────────────────────────────────────────

def test_exchange_issues_session_once(auth_client, users, codes, monkeypatch):
    mock_provider(monkeypatch, GOOGLE_OK)
    code = signed_in_code(callback(auth_client, "google"))
    [stored] = codes
    assert code not in str(stored)  # only the hash is stored
    assert stored["used"] is False
    ttl = stored["expires_at"] - datetime.utcnow()
    assert timedelta(seconds=50) < ttl <= timedelta(seconds=60)

    # A stale refresh cookie must not trip CSRF: there's no session to protect yet.
    auth_client.cookies.set("gg_refresh", "stale", path="/auth")
    resp = exchange(auth_client, code)
    assert resp.status_code == 200
    assert resp.json()["email"] == "ada@example.com"
    assert resp.json()["username"] == "AdaLovelace"
    assert "gg_session=" in resp.headers.get("set-cookie", "")

    assert exchange(auth_client, code).status_code == 400  # reused


def test_exchange_expired_code_rejected(auth_client, users, codes, monkeypatch):
    mock_provider(monkeypatch, GOOGLE_OK)
    code = signed_in_code(callback(auth_client, "google"))
    codes[0]["expires_at"] = datetime.utcnow() - timedelta(seconds=1)
    resp = exchange(auth_client, code)
    assert resp.status_code == 400
    assert "gg_session=" not in resp.headers.get("set-cookie", "")


def test_exchange_unknown_code_rejected(auth_client, users):
    assert exchange(auth_client, "nope").status_code == 400


# ─── password login for OAuth-only users ─────────────────────────────────────

def test_password_login_on_oauth_only_user_is_generic_401(auth_client, mock_db):
    mock_db.users.find_one = AsyncMock(
        return_value={
            "_id": ObjectId(),
            "email": "ada@example.com",
            "username": "ada",
            "hashed_password": None,
            "oauth": {"google": "g-123"},
            "created_at": "2024-01-01T00:00:00",
        }
    )
    resp = auth_client.post("/auth/login", json={"email": "ada@example.com", "password": "whatever123"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid email or password"
    mock_db.login_attempts.find_one_and_update.assert_awaited()  # counts toward lockout


def test_oauth_only_user_can_set_password_via_reset(auth_client, mock_db, users, monkeypatch):
    from tests.test_password_reset import _fake_password_resets

    monkeypatch.setattr("app.routers.auth.secrets.token_urlsafe", lambda n: "oauth-reset-token")
    _fake_password_resets(mock_db)
    mock_db.refresh_tokens.update_many = AsyncMock()
    _id = ObjectId()
    users[_id] = {"_id": _id, "email": "ada@example.com", "username": "ada", "hashed_password": None}

    assert auth_client.post("/auth/forgot-password", json={"email": "ada@example.com"}).status_code == 202
    resp = auth_client.post(
        "/auth/reset-password", json={"token": "oauth-reset-token", "newPassword": "brand-new-pass1"}
    )
    assert resp.status_code == 204
    assert users[_id]["hashed_password"]
