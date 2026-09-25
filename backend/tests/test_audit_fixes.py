"""
Regression tests for the 2026-09-25 backend audit fixes.
LLM, Mongo, and Replicate are mocked — no real network calls.
"""
import asyncio
import base64
import io
import json
import logging
import zipfile
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from bson import ObjectId

from app.services.auth_service import hash_password
from app.services.llm_utils import complete, extract_json
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor, make_llm_response


# ─── LLM helpers ──────────────────────────────────────────────────────────────

def test_extract_json_rejects_non_object():
    with pytest.raises(ValueError):
        extract_json('["a", "b"]')


def test_complete_wraps_provider_errors_as_value_error(monkeypatch):
    llm = MagicMock(side_effect=RuntimeError("provider down"))
    monkeypatch.setattr("litellm.completion", llm)
    with pytest.raises(ValueError, match="LLM call failed"):
        asyncio.run(complete("sys", "user"))
    assert llm.call_args.kwargs["timeout"] == 90


def test_systems_analyze_502_on_provider_error(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr("litellm.completion", MagicMock(side_effect=RuntimeError("timeout")))
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze", json={"nodes": [], "edges": []}
    )
    assert resp.status_code == 502


def test_systems_extract_skips_non_dict_nodes_and_never_regresses_stage(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "assets"}
    mock_db.gdds.find_one.return_value = {"project_id": TEST_PROJECT_ID, "sections": {"overview": "Bees."}}
    payload = {"nodes": ["garbage", {"type": "entity", "label": "Bee", "stats": {}}]}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps(payload))))
    inserted_id = ObjectId()
    mock_db.systems.find_one.side_effect = [
        None,
        {"_id": inserted_id, "project_id": TEST_PROJECT_ID, "nodes": [], "edges": [], "updated_at": datetime.utcnow()},
    ]
    mock_db.systems.insert_one.return_value = MagicMock(inserted_id=inserted_id)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/systems/extract")
    assert resp.status_code == 201
    inserted = mock_db.systems.insert_one.call_args[0][0]
    assert [n["label"] for n in inserted["nodes"]] == ["Bee"]
    mock_db.projects.update_one.assert_not_called()


# ─── Unity plan grounding ─────────────────────────────────────────────────────

def test_unity_plan_renumbers_and_grounds_create_script(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.assets.find.return_value = make_cursor(
        [{"type": "script", "name": "PlayerController", "code": "class PlayerController {}"}]
    )
    plan = {
        "summary": "Build it",
        "steps": [
            {"stepNumber": 7, "description": "scene", "tool": "scene.new", "args": {}, "category": "scene"},
            {"stepNumber": 7, "description": "known script", "tool": "asset.createScript",
             "args": {"className": "PlayerController", "code": "INVENTED", "path": "Assets/Scripts/PlayerController.cs"},
             "category": "asset"},
            {"stepNumber": 99, "description": "invented script", "tool": "asset.createScript",
             "args": {"className": "EnemyAI", "code": "INVENTED"}, "category": "asset"},
            {"stepNumber": 3, "description": "go", "tool": "gameobject.create", "args": {"name": "Player"},
             "category": "gameobject"},
        ],
    }
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps(plan))))
    mock_db.unity_plans.find_one.side_effect = lambda q: {
        "_id": ObjectId(), **mock_db.unity_plans.replace_one.call_args[0][1]
    }

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 201
    steps = resp.json()["steps"]
    assert [s["stepNumber"] for s in steps] == [1, 2, 3]
    assert [s["description"] for s in steps] == ["scene", "known script", "go"]
    assert steps[1]["args"] == {"className": "PlayerController", "path": "Assets/Scripts/PlayerController.cs"}


# ─── Playtest / deployment grounding ─────────────────────────────────────────

def test_playtest_409_without_gdd(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    assert resp.status_code == 409
    llm.assert_not_called()


@pytest.mark.parametrize("path, body", [("store-page", {"platform": "steam"}), ("press-kit", {})])
def test_marketing_copy_409_without_gdd_or_concept(client, mock_db, monkeypatch, path, body):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/deployment/{path}", json=body)
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Add a concept or GDD first"
    llm.assert_not_called()


def test_store_page_context_includes_project_and_concept(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {
        **TEST_PROJECT,
        "concept_card": {"title": "Test Game", "genre": "rpg", "platform": "pc", "unique_hook": "Bees rewind time"},
    }
    store = {"title": "Test Game", "shortDescription": "s", "longDescription": "l", "tags": "not-a-list", "bullets": []}
    llm = MagicMock(return_value=make_llm_response(json.dumps(store)))
    monkeypatch.setattr("litellm.completion", llm)
    inserted_id = ObjectId()
    mock_db.deployments.insert_one.return_value = MagicMock(inserted_id=inserted_id)
    mock_db.deployments.find_one.return_value = {
        "_id": inserted_id, "project_id": TEST_PROJECT_ID, "type": "storePage",
        "created_at": datetime.utcnow(), "title": "Test Game", "tags": [], "bullets": [],
    }

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/deployment/store-page", json={"platform": "steam"})
    assert resp.status_code == 201
    prompt = str(llm.call_args)
    assert "Title: Test Game" in prompt and "Genre: rpg" in prompt and "Tone: epic" in prompt
    assert "Bees rewind time" in prompt
    assert mock_db.deployments.insert_one.call_args[0][0]["tags"] == []  # _list guard


def test_export_bundle_dedupes_names_and_keeps_svg(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()
    mock_db.assets.find.return_value = make_cursor([
        {"type": "script", "name": "Player", "code": "a"},
        {"type": "script", "name": "Player", "code": "b"},
        {"type": "sprite", "name": "Hero", "url": svg},
    ])
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/export")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert zf.read("Scripts/Player.cs") == b"a"
    assert zf.read("Scripts/Player_2.cs") == b"b"
    assert zf.read("Sprites/Hero.svg") == b"<svg/>"


def test_cors_exposes_content_disposition(client):
    resp = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert "content-disposition" in resp.headers.get("access-control-expose-headers", "").lower()


# ─── Sprites ──────────────────────────────────────────────────────────────────

def test_replicate_network_error_becomes_sprite_generation_error(monkeypatch):
    from app.services import replicate_service

    monkeypatch.setattr(replicate_service.settings, "replicate_api_token", "tok")

    class BrokenClient:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, *a, **k): raise httpx.ConnectTimeout("slow")

    monkeypatch.setattr(replicate_service.httpx, "AsyncClient", BrokenClient)
    with pytest.raises(replicate_service.SpriteGenerationError):
        asyncio.run(replicate_service.generate_sprite_image("a bee", "pixel"))


# ─── Models ───────────────────────────────────────────────────────────────────

def test_sprite_description_over_limit_422(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/sprites", json={"name": "Bee", "description": "x" * 2001}
    )
    assert resp.status_code == 422


def test_project_update_rejects_empty_title(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}", json={"title": ""})
    assert resp.status_code == 422


# ─── Auth ─────────────────────────────────────────────────────────────────────

USER = {
    "_id": ObjectId(),
    "email": "u@example.com",
    "username": "u",
    "hashed_password": hash_password("correct-password1"),
    "plan": "free",
    "created_at": "2024-01-01T00:00:00",
}


def test_one_failure_after_expired_lock_does_not_relock(auth_client, mock_db):
    from tests.test_auth_lockout import _fake_login_attempts

    store = _fake_login_attempts(mock_db)
    mock_db.users.find_one = AsyncMock(return_value=USER)
    store[USER["email"]] = {
        "email": USER["email"],
        "failed_count": 8,
        "locked_until": datetime.utcnow() - timedelta(minutes=1),
        "last_failed_at": datetime.utcnow() - timedelta(minutes=16),
    }

    resp = auth_client.post("/auth/login", json={"email": USER["email"], "password": "wrong-password1"})
    assert resp.status_code == 401
    assert store[USER["email"]]["failed_count"] == 1
    assert store[USER["email"]]["locked_until"] is None


def test_failures_outside_window_reset_count(auth_client, mock_db):
    from tests.test_auth_lockout import _fake_login_attempts

    store = _fake_login_attempts(mock_db)
    mock_db.users.find_one = AsyncMock(return_value=USER)
    store[USER["email"]] = {
        "email": USER["email"],
        "failed_count": 7,
        "locked_until": None,
        "last_failed_at": datetime.utcnow() - timedelta(hours=2),
    }
    auth_client.post("/auth/login", json={"email": USER["email"], "password": "wrong-password1"})
    assert store[USER["email"]]["failed_count"] == 1


def test_reset_email_log_never_contains_token(caplog):
    from app.services.email_sender import send_password_reset

    with caplog.at_level(logging.INFO):
        asyncio.run(send_password_reset("u@example.com", "/reset-password?token=SECRET123"))
    assert "SECRET123" not in caplog.text
    assert "u@example.com" not in caplog.text
