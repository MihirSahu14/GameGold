"""
Integration tests for /projects/{id}/systems routes.
Uses TestClient with MongoDB and LLM mocked (see conftest.py).
All tests here fail until backend/app/routers/systems.py is implemented.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from bson import ObjectId
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import (
    TEST_PROJECT_ID,
    TEST_USER_ID,
    TEST_PROJECT,
    CANNED_BALANCE_JSON,
    CANNED_BALANCE_TEXT,
)

# ─── Sample payloads ──────────────────────────────────────────────────────────

SAMPLE_NODES = [
    {"id": "n1", "type": "entity", "label": "Player", "data": {}, "position": {"x": 0, "y": 0}},
    {"id": "n2", "type": "entity", "label": "Enemy", "data": {}, "position": {"x": 100, "y": 0}},
]
SAMPLE_EDGES = [
    {"id": "e1", "source": "n1", "target": "n2", "label": "attacks"},
]


def _make_system_doc(project_id: str = TEST_PROJECT_ID, with_analysis: bool = False) -> dict:
    doc = {
        "_id": ObjectId(),
        "project_id": project_id,
        "nodes": SAMPLE_NODES,
        "edges": SAMPLE_EDGES,
        "analysis_cache": None,
        "updated_at": datetime.utcnow(),
    }
    if with_analysis:
        doc["analysis_cache"] = {
            "exploits": CANNED_BALANCE_JSON["exploits"],
            "power_creep": CANNED_BALANCE_JSON["powerCreep"],
            "dominant_strategies": CANNED_BALANCE_JSON["dominantStrategies"],
            "suggestions": CANNED_BALANCE_JSON["suggestions"],
            "analyzed_at": datetime.utcnow().isoformat(),
        }
    return doc


# ─── GET /projects/{id}/systems ───────────────────────────────────────────────

def test_get_systems_404_when_none_exists(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.return_value = None

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/systems")
    assert resp.status_code == 404


def test_get_systems_200_returns_system(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.return_value = _make_system_doc()

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/systems")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert len(data["nodes"]) == 2


def test_get_systems_includes_analysis_cache_when_present(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.return_value = _make_system_doc(with_analysis=True)

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/systems")
    assert resp.status_code == 200
    data = resp.json()
    assert data["analysisCache"] is not None


def test_get_systems_403_wrong_user(client, mock_db):
    wrong_project = {**TEST_PROJECT, "user_id": str(ObjectId())}
    mock_db.projects.find_one.return_value = wrong_project

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/systems")
    assert resp.status_code == 403


# ─── POST /projects/{id}/systems/save ─────────────────────────────────────────

def test_save_systems_creates_new_doc(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.side_effect = [None, _make_system_doc()]
    mock_db.systems.insert_one.return_value = MagicMock(inserted_id=ObjectId())

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/save",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    assert resp.status_code == 201
    mock_db.systems.insert_one.assert_called_once()


def test_save_systems_upserts_existing_doc(client, mock_db):
    existing = _make_system_doc()
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.side_effect = [existing, existing]

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/save",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    assert resp.status_code == 200
    mock_db.systems.update_one.assert_called_once()


def test_save_systems_advances_project_stage(client, mock_db):
    """Saving systems for the first time sets project stage to 'systems'."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.side_effect = [None, _make_system_doc()]
    mock_db.systems.insert_one.return_value = MagicMock(inserted_id=ObjectId())

    client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/save",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    # projects.update_one must have been called to advance stage
    mock_db.projects.update_one.assert_called_once()
    call_args = mock_db.projects.update_one.call_args
    assert call_args[0][1]["$set"]["stage"] == "systems"


def test_save_systems_returns_json_with_camel_case_keys(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.side_effect = [None, _make_system_doc()]
    mock_db.systems.insert_one.return_value = MagicMock(inserted_id=ObjectId())

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/save",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    data = resp.json()
    assert "projectId" in data
    assert "updatedAt" in data


# ─── POST /projects/{id}/systems/analyze ─────────────────────────────────────

def _make_litellm_response(text: str) -> MagicMock:
    msg = MagicMock()
    msg.content = text
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def test_analyze_returns_balance_analysis(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "exploits" in data
    assert "powerCreep" in data
    assert "dominantStrategies" in data
    assert "suggestions" in data
    assert "analyzedAt" in data


def test_analyze_caches_result_on_system_doc(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    mock_db.systems.update_one.assert_called_once()
    call_args = mock_db.systems.update_one.call_args
    assert "analysis_cache" in call_args[0][1]["$set"]


def test_analyze_uses_gdd_summary_when_available(client, mock_db, monkeypatch):
    """When a GDD exists, its overview is passed to the balance service."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {
        "project_id": TEST_PROJECT_ID,
        "sections": {"overview": "Epic fantasy RPG", "mechanics": "Turn-based combat"},
    }

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    prompt_text = str(mock_completion.call_args)
    assert "Epic fantasy RPG" in prompt_text


def test_analyze_403_wrong_user(client, mock_db):
    wrong_project = {**TEST_PROJECT, "user_id": str(ObjectId())}
    mock_db.projects.find_one.return_value = wrong_project

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    assert resp.status_code == 403


# ─── Auth guard ───────────────────────────────────────────────────────────────

def test_routes_require_auth(mock_db, monkeypatch):
    """Without get_current_user override, routes return 403 (no bearer token)."""
    monkeypatch.setattr("app.routers.systems.get_db", lambda: mock_db)
    monkeypatch.setattr("app.main.connect_db", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())
    # Explicitly do NOT override get_current_user
    app.dependency_overrides.clear()

    with TestClient(app) as bare_client:
        resp = bare_client.get(f"/projects/{TEST_PROJECT_ID}/systems")
        assert resp.status_code in (401, 403)
