"""
Shared pytest fixtures for all backend tests.
Patches MongoDB and Anthropic so no real network calls are made.
"""
import os

# Must set before any app module is imported — Settings reads env at import time.
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB", "gamegold_test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-32-chars-long-ok")
os.environ.setdefault("LLM_API_KEY", "test-llm-key")
os.environ.setdefault("LLM_MODEL", "groq/llama-3.3-70b-versatile")

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.routers.auth import get_current_user
from app.services.auth_service import create_access_token

# ─── Stable IDs used across tests ────────────────────────────────────────────

TEST_USER_ID = str(ObjectId())
TEST_PROJECT_ID = str(ObjectId())

TEST_USER = {
    "_id": TEST_USER_ID,
    "email": "test@example.com",
    "username": "testuser",
    "plan": "free",
    "created_at": "2024-01-01T00:00:00",
}

TEST_PROJECT = {
    "_id": ObjectId(TEST_PROJECT_ID),
    "user_id": TEST_USER_ID,
    "title": "Test Game",
    "stage": "gdd",
    "genre": "rpg",
    "platform": "pc",
    "tone": "epic",
}


# ─── DB mock ──────────────────────────────────────────────────────────────────

def make_cursor(docs: list) -> MagicMock:
    """Mock a Motor cursor: find(...).sort(...).to_list(n) → docs."""
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=docs)
    return cursor


def make_llm_response(text: str) -> MagicMock:
    """Mock LiteLLM completion response with the given content text."""
    msg = MagicMock()
    msg.content = text
    choice = MagicMock()
    choice.message = msg
    response = MagicMock()
    response.choices = [choice]
    return response


@pytest.fixture
def mock_db():
    """In-memory mock of the Motor database. Each collection is an AsyncMock."""
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value=None)
    db.users.insert_one = AsyncMock()
    db.users.update_one = AsyncMock()

    db.projects = MagicMock()
    db.projects.find_one = AsyncMock(return_value=None)
    db.projects.insert_one = AsyncMock()
    db.projects.update_one = AsyncMock()

    db.gdds = MagicMock()
    db.gdds.find_one = AsyncMock(return_value=None)

    db.systems = MagicMock()
    db.systems.find_one = AsyncMock(return_value=None)
    db.systems.insert_one = AsyncMock()
    db.systems.update_one = AsyncMock()

    db.assets = MagicMock()
    db.assets.find = MagicMock(return_value=make_cursor([]))
    db.assets.find_one = AsyncMock(return_value=None)
    db.assets.insert_one = AsyncMock()
    db.assets.update_one = AsyncMock()
    db.assets.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

    db.playtests = MagicMock()
    db.playtests.find = MagicMock(return_value=make_cursor([]))
    db.playtests.find_one = AsyncMock(return_value=None)
    db.playtests.insert_one = AsyncMock()
    db.playtests.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

    db.bugs = MagicMock()
    db.bugs.find = MagicMock(return_value=make_cursor([]))
    db.bugs.find_one = AsyncMock(return_value=None)
    db.bugs.insert_one = AsyncMock()
    db.bugs.update_one = AsyncMock(return_value=MagicMock(matched_count=1))
    db.bugs.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

    db.deployments = MagicMock()
    db.deployments.find = MagicMock(return_value=make_cursor([]))
    db.deployments.find_one = AsyncMock(return_value=None)
    db.deployments.insert_one = AsyncMock()
    db.deployments.update_one = AsyncMock()
    db.deployments.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

    return db


# ─── TestClient ───────────────────────────────────────────────────────────────

@pytest.fixture
def client(mock_db, monkeypatch):
    """
    FastAPI TestClient with:
    - MongoDB replaced by mock_db (patched at the import site in each router)
    - Lifespan connect/close mocked (no real Mongo ping)
    - get_current_user overridden to return TEST_USER
    """
    # Patch get_db at the import sites (not at the definition site) so that
    # the already-bound names in each router module get replaced correctly.
    monkeypatch.setattr("app.routers.systems.get_db", lambda: mock_db)
    monkeypatch.setattr("app.routers.gdd.get_db", lambda: mock_db)
    monkeypatch.setattr("app.routers.projects.get_db", lambda: mock_db)
    monkeypatch.setattr("app.routers.assets.get_db", lambda: mock_db)
    monkeypatch.setattr("app.routers.playtest.get_db", lambda: mock_db)
    monkeypatch.setattr("app.routers.deployment.get_db", lambda: mock_db)
    monkeypatch.setattr("app.main.connect_db", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())

    app.dependency_overrides[get_current_user] = lambda: TEST_USER

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(mock_db, monkeypatch):
    """
    TestClient exercising the *real* auth flow (no get_current_user override)
    against a mocked db.users collection — for testing login/register/me/logout
    and the cookie + CSRF middleware directly.
    """
    from app.core.rate_limit import limiter

    monkeypatch.setattr("app.routers.auth.get_db", lambda: mock_db)
    monkeypatch.setattr("app.main.connect_db", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())
    limiter.reset()

    with TestClient(app) as c:
        yield c


# ─── Auth helpers ─────────────────────────────────────────────────────────────

@pytest.fixture
def auth_token():
    return create_access_token(TEST_USER_ID)


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}


# ─── Canned Claude balance response ──────────────────────────────────────────

CANNED_BALANCE_JSON = {
    "exploits": ["Player can farm infinite gold by looping Enemy → Currency edge"],
    "powerCreep": ["Sword damage scales 3× faster than Enemy HP"],
    "dominantStrategies": ["Rushing Sword item trivialises early game"],
    "suggestions": ["Cap Currency drop rate per enemy", "Normalize Sword damage curve"],
}

CANNED_BALANCE_TEXT = json.dumps(CANNED_BALANCE_JSON)


@pytest.fixture
def mock_claude_response():
    """Mock Anthropic message response with canned balance JSON."""
    content_block = MagicMock()
    content_block.text = CANNED_BALANCE_TEXT
    response = MagicMock()
    response.content = [content_block]
    return response
