"""
Per-user LLM rate limiting (A1). LLM calls are mocked — no real network calls.
"""
import json
from unittest.mock import MagicMock

from fastapi import Request

from app.core.rate_limit import LLM_RATE_LIMIT
from app.routers.auth import get_current_user
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_llm_response

LIMIT = int(LLM_RATE_LIMIT.split("/")[0])

CANNED_ANALYSIS = json.dumps(
    {"exploits": [], "powerCreep": [], "dominantStrategies": [], "suggestions": []}
)


def _user_override(user_id: str):
    """Dependency override that mirrors what get_current_user now does: stamp
    request.state.user_id before returning the user, so the rate limit key
    picks it up."""

    def _override(request: Request) -> dict:
        request.state.user_id = user_id
        return {"_id": user_id, "email": f"{user_id}@example.com", "username": user_id}

    return _override


def _analyze(client, monkeypatch):
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(CANNED_ANALYSIS)))
    return client.post(f"/projects/{TEST_PROJECT_ID}/systems/analyze", json={})


def _prime_project_for(mock_db, user_id: str):
    """verify_project_access requires the acting user to own the project."""
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "user_id": user_id}
    mock_db.gdds.find_one.return_value = None


def test_authenticated_user_gets_429_with_retry_after_after_flooding(client, mock_db, monkeypatch):
    _prime_project_for(mock_db, "user-flood")
    client.app.dependency_overrides[get_current_user] = _user_override("user-flood")

    for _ in range(LIMIT):
        assert _analyze(client, monkeypatch).status_code == 200

    resp = _analyze(client, monkeypatch)
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


def test_two_authenticated_users_have_independent_budgets(client, mock_db, monkeypatch):
    _prime_project_for(mock_db, "user-a")
    client.app.dependency_overrides[get_current_user] = _user_override("user-a")
    for _ in range(LIMIT):
        assert _analyze(client, monkeypatch).status_code == 200
    assert _analyze(client, monkeypatch).status_code == 429

    # A different authenticated user is not affected by user-a's flood.
    _prime_project_for(mock_db, "user-b")
    client.app.dependency_overrides[get_current_user] = _user_override("user-b")
    assert _analyze(client, monkeypatch).status_code == 200
