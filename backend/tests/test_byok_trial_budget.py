import litellm
"""BYOK + trial budget: the complete() gate, /me/llm routes, key encryption/scrubbing,
402 shape, and client IP for rate limits. LiteLLM is always mocked."""
import asyncio
from unittest.mock import MagicMock

import pytest
from cryptography.fernet import Fernet
from starlette.requests import Request

from app.config import settings
from app.core.rate_limit import client_ip, user_or_ip_key
from app.routers.auth import get_current_user
from app.services.llm_keys import decrypt_key, encrypt_key, scrub
from app.services.llm_utils import TrialBudgetExhausted, complete, current_llm_user
from tests.conftest import TEST_USER, make_llm_response

KEY = "sk-or-v1-abcdef1234567890SECRETSECRET"


@pytest.fixture
def secret(monkeypatch):
    monkeypatch.setattr(settings, "llm_key_secret", Fernet.generate_key().decode())


@pytest.fixture
def llm_ok(monkeypatch):
    completion = MagicMock(return_value=make_llm_response("ok"))
    monkeypatch.setattr("litellm.completion", completion)
    monkeypatch.setattr("litellm.completion_cost", MagicMock(return_value=0.0123))
    return completion


def _own_key_user() -> dict:
    return {**TEST_USER, "llm": {
        "provider": "openrouter", "model": "openrouter/openai/gpt-5", "key_encrypted": encrypt_key(KEY), "key_last4": KEY[-4:],
    }}


def _run(user, coro_fn):
    async def go():
        current_llm_user.set(user)
        return await coro_fn()
    return asyncio.run(go())


# ─── Trial budget ────────────────────────────────────────────────────────────

def test_trial_under_budget_calls_and_records_cost(mock_db, llm_ok):
    mock_db.llm_budget.find_one.return_value = {"spent_usd": 0.5, "calls": 10}
    assert _run(None, lambda: complete("sys", "hi")) == "ok"
    assert llm_ok.call_args.kwargs["model"] == settings.llm_model
    assert llm_ok.call_args.kwargs["api_key"] == settings.llm_api_key
    (query, update), kwargs = mock_db.llm_budget.update_one.call_args
    assert update == {"$inc": {"spent_usd": 0.0123, "calls": 1}}
    assert kwargs == {"upsert": True}
    assert len(query["_id"]) == 10  # YYYY-MM-DD


@pytest.mark.parametrize("spent", [1.0, 1.5])
def test_trial_at_or_over_budget_raises_without_calling(mock_db, llm_ok, spent):
    mock_db.llm_budget.find_one.return_value = {"spent_usd": spent, "calls": 99}
    with pytest.raises(TrialBudgetExhausted):
        _run(None, lambda: complete("sys", "hi"))
    llm_ok.assert_not_called()
    mock_db.llm_budget.update_one.assert_not_called()


def test_unpriceable_model_records_zero(mock_db, llm_ok, monkeypatch):
    monkeypatch.setattr("litellm.completion_cost", MagicMock(side_effect=Exception("no price")))
    _run(None, lambda: complete("sys", "hi"))
    assert mock_db.llm_budget.update_one.call_args.args[1]["$inc"]["spent_usd"] == 0.0


def test_402_shape(client, mock_db, llm_ok):
    mock_db.llm_budget.find_one.return_value = {"spent_usd": 5.0, "calls": 1}
    resp = client.get("/health/llm")
    assert resp.status_code == 402
    assert resp.json() == {
        "detail": "Today's free AI budget is used up. Add your own API key in Settings to keep going.",
        "code": "trial_budget_exhausted",
    }


# ─── Own key ─────────────────────────────────────────────────────────────────

def test_own_key_uses_user_model_and_skips_budget(mock_db, llm_ok, secret):
    mock_db.llm_budget.find_one.return_value = {"spent_usd": 99.0, "calls": 1}  # trial exhausted
    assert _run(_own_key_user(), lambda: complete("sys", "hi")) == "ok"
    assert llm_ok.call_args.kwargs["model"] == "openrouter/openai/gpt-5"
    assert llm_ok.call_args.kwargs["api_key"] == KEY
    mock_db.llm_budget.find_one.assert_not_called()
    mock_db.llm_budget.update_one.assert_not_called()


def test_own_key_error_is_scrubbed_and_never_falls_back(mock_db, secret, monkeypatch):
    completion = MagicMock(side_effect=Exception(f"401 invalid api key {KEY} (also sk-ant-api03-zzzzzzzzzzzz)"))
    monkeypatch.setattr("litellm.completion", completion)
    with pytest.raises(ValueError) as info:
        _run(_own_key_user(), lambda: complete("sys", "hi"))
    msg = str(info.value)
    assert msg.startswith("Your OpenRouter key was rejected:")
    assert KEY not in msg and "sk-ant" not in msg
    assert info.value.__cause__ is None
    assert completion.call_count == 1  # no retry on the trial key


def test_encryption_round_trip(secret):
    token = encrypt_key(KEY)
    assert KEY not in token
    assert decrypt_key(token) == KEY


def test_scrub():
    assert scrub(f"bad {KEY} x", KEY) == "bad *** x"
    assert "AIza" not in scrub("key AIzaSyA1234567890abcdefghij rejected")
    assert "gsk_" not in scrub("key gsk_abcdefghijklmnop1234 rejected")


def test_get_current_user_sets_context(mock_db, monkeypatch):
    from bson import ObjectId
    from app.core.csrf import SESSION_COOKIE
    from app.services.auth_service import create_access_token
    from tests.conftest import TEST_USER_ID

    monkeypatch.setattr("app.routers.auth.get_db", lambda: mock_db)
    mock_db.users.find_one.return_value = {**TEST_USER, "_id": ObjectId(TEST_USER_ID)}
    request = _req({"Cookie": f"{SESSION_COOKIE}={create_access_token(TEST_USER_ID)}"})

    async def go():
        await get_current_user(request, None)
        return current_llm_user.get()

    assert asyncio.run(go())["_id"] == TEST_USER_ID


# ─── /me/llm routes ──────────────────────────────────────────────────────────

def test_get_trial_shape(client, mock_db):
    mock_db.llm_budget.find_one.return_value = {"spent_usd": 0.25, "calls": 3}
    resp = client.get("/me/llm")
    assert resp.status_code == 200
    assert resp.json() == {
        "provider": None, "model": None, "keyLast4": None, "usingOwnKey": False,
        "trial": {"budgetUsd": 1.0, "spentUsd": 0.25, "remainingUsd": 0.75},
    }


def test_get_own_key_never_returns_key(client, secret):
    user = _own_key_user()
    client.app.dependency_overrides[get_current_user] = lambda: user
    resp = client.get("/me/llm")
    body = resp.json()
    assert body["usingOwnKey"] is True
    assert body["provider"] == "openrouter" and body["keyLast4"] == KEY[-4:]
    assert KEY not in resp.text and user["llm"]["key_encrypted"] not in resp.text


def _put(client, **overrides):
    body = {"provider": "openrouter", "model": "openrouter/openai/gpt-5", "apiKey": KEY, **overrides}
    return client.put("/me/llm", json=body)


def test_put_tests_key_then_saves_encrypted(client, mock_db, llm_ok, secret):
    resp = _put(client)
    assert resp.status_code == 200, resp.text
    assert KEY not in resp.text
    assert resp.json()["usingOwnKey"] is True and resp.json()["model"] == "openrouter/openai/gpt-5"
    assert llm_ok.call_args.kwargs["api_key"] == KEY
    assert llm_ok.call_args.kwargs["max_tokens"] == 5
    saved = mock_db.users.update_one.call_args.args[1]["$set"]["llm"]
    assert KEY not in str(saved)
    assert decrypt_key(saved["key_encrypted"]) == KEY
    mock_db.llm_budget.update_one.assert_not_called()  # test call is on the user's bill


def test_put_failed_test_call_is_400_scrubbed(client, mock_db, secret, monkeypatch):
    monkeypatch.setattr("litellm.completion", MagicMock(side_effect=Exception(f"AuthenticationError: bad key {KEY}")))
    resp = _put(client)
    assert resp.status_code == 400
    assert resp.json()["detail"].startswith("Your OpenRouter key was rejected:")
    assert KEY not in resp.text
    mock_db.users.update_one.assert_not_called()


def test_put_provider_model_mismatch_is_422_without_key(client, llm_ok, secret):
    resp = _put(client, model="anthropic/claude-haiku-4-5")
    assert resp.status_code == 422
    assert KEY not in resp.text
    llm_ok.assert_not_called()


def test_put_without_secret_is_503(client, llm_ok, monkeypatch):
    monkeypatch.setattr(settings, "llm_key_secret", "")
    resp = _put(client)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Own keys are not configured on this server"
    llm_ok.assert_not_called()


def test_delete_returns_to_trial(client, mock_db):
    resp = client.delete("/me/llm")
    assert resp.status_code == 200
    assert resp.json()["usingOwnKey"] is False
    assert mock_db.users.update_one.call_args.args[1] == {"$unset": {"llm": ""}}


# ─── Client IP ───────────────────────────────────────────────────────────────

def _req(headers: dict, client=("9.9.9.9", 1234)) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw, "client": client, "state": {}})


def test_client_ip_takes_leftmost_forwarded_entry():
    # Render sets the first entry to the real client; later entries are proxy hops.
    assert client_ip(_req({"X-Forwarded-For": "1.2.3.4, 172.16.0.1, 10.0.0.2"})) == "1.2.3.4"


def test_client_ip_falls_back_to_socket_peer():
    assert client_ip(_req({})) == "9.9.9.9"
    assert client_ip(_req({"X-Forwarded-For": " "})) == "9.9.9.9"


def test_rate_limit_key_prefers_user():
    req = _req({"X-Forwarded-For": "1.2.3.4"})
    assert user_or_ip_key(req) == "1.2.3.4"
    req.state.user_id = "abc"
    assert user_or_ip_key(req) == "user:abc"


def test_real_auth_route_runs_on_own_key(auth_client, mock_db, llm_ok, secret, auth_headers):
    """Context set in the get_current_user dependency reaches complete() inside the endpoint."""
    from bson import ObjectId
    from tests.conftest import TEST_USER_ID

    mock_db.users.find_one.return_value = {**_own_key_user(), "_id": ObjectId(TEST_USER_ID)}
    mock_db.llm_budget.find_one.return_value = {"spent_usd": 99.0, "calls": 1}
    resp = auth_client.get("/health/llm", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert llm_ok.call_args.kwargs["api_key"] == KEY


def test_own_key_auth_error_reads_plainly(mock_db, secret, monkeypatch):
    err = litellm.AuthenticationError(message=f"User not found {KEY}", llm_provider="openrouter", model="x")
    monkeypatch.setattr("litellm.completion", MagicMock(side_effect=err))
    with pytest.raises(ValueError) as info:
        _run(_own_key_user(), lambda: complete("sys", "hi"))
    assert str(info.value) == "Your OpenRouter key was rejected — check that it's correct and still active."
