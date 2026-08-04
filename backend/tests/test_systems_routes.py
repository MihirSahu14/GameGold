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


def test_analyze_suggestions_are_structured_objects(client, mock_db, monkeypatch):
    """Suggestions are {nodeLabel, stat, currentValue, suggestedValue, rationale} objects, not prose strings."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    assert resp.status_code == 200
    suggestion = resp.json()["suggestions"][0]
    assert suggestion["nodeLabel"] == "Enemy"
    assert suggestion["stat"] == "goldDrop"
    assert suggestion["currentValue"] == 50
    assert suggestion["suggestedValue"] == 10
    assert "rationale" in suggestion


def test_analyze_skips_malformed_suggestions_without_500(client, mock_db, monkeypatch):
    """A suggestion missing required fields is dropped, not a 500."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None

    malformed = {
        "exploits": [],
        "powerCreep": [],
        "dominantStrategies": [],
        "suggestions": [
            {"nodeLabel": "Enemy"},  # missing stat/currentValue/suggestedValue/rationale
            "not even an object",
            {
                "nodeLabel": "Sword",
                "stat": "damage",
                "currentValue": 30,
                "suggestedValue": 15,
                "rationale": "valid entry",
            },
        ],
    }
    mock_completion = MagicMock(return_value=_make_litellm_response(json.dumps(malformed)))
    monkeypatch.setattr("litellm.completion", mock_completion)

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    assert resp.status_code == 200
    suggestions = resp.json()["suggestions"]
    assert len(suggestions) == 1
    assert suggestions[0]["nodeLabel"] == "Sword"


def test_analyze_caches_result_on_system_doc(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None
    mock_db.systems.find_one.return_value = _make_system_doc()

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    mock_db.systems.update_one.assert_called_once()
    call_args = mock_db.systems.update_one.call_args
    assert "analysis_cache" in call_args[0][1]["$set"]
    mock_db.systems.insert_one.assert_not_called()


def test_analyze_before_first_save_inserts_full_doc(client, mock_db, monkeypatch):
    """Analyze on an unsaved graph inserts a complete system doc, not a cache-only phantom."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None
    mock_db.systems.find_one.return_value = None

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/systems/analyze",
        json={"nodes": SAMPLE_NODES, "edges": SAMPLE_EDGES},
    )
    assert resp.status_code == 200
    mock_db.systems.insert_one.assert_called_once()
    doc = mock_db.systems.insert_one.call_args[0][0]
    assert len(doc["nodes"]) == 2
    assert len(doc["edges"]) == 1
    assert doc["analysis_cache"] is not None
    assert "updated_at" in doc
    mock_db.systems.update_one.assert_not_called()
    # Stage still advances even though save never ran
    mock_db.projects.update_one.assert_called_once()
    assert mock_db.projects.update_one.call_args[0][1]["$set"]["stage"] == "systems"


def test_get_systems_survives_legacy_phantom_doc(client, mock_db):
    """Old analyze-only docs (no nodes/edges/updated_at) must not 500."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.systems.find_one.return_value = {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "analysis_cache": None,
    }

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/systems")
    assert resp.status_code == 200
    assert resp.json()["nodes"] == []


def test_invalid_project_id_returns_404(client, mock_db):
    resp = client.get("/projects/not-an-objectid/systems")
    assert resp.status_code == 404


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


# ─── POST /projects/{id}/systems/extract ─────────────────────────────────────

def test_extract_404_without_gdd(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/systems/extract")
    assert resp.status_code == 404


def test_extract_merges_new_nodes(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {
        "project_id": TEST_PROJECT_ID,
        "sections": {"overview": "A dungeon crawler", "mechanics": "Turn-based combat", "progression": ""},
    }
    mock_db.systems.find_one.side_effect = [None, _make_system_doc()]
    mock_db.systems.insert_one.return_value = MagicMock(inserted_id=ObjectId())

    extract_payload = {
        "nodes": [
            {"type": "entity", "label": "Goblin", "stats": {"hp": 20}},
            {"type": "mechanic", "label": "Dodge Roll", "stats": {}},
        ]
    }
    mock_completion = MagicMock(return_value=_make_litellm_response(json.dumps(extract_payload)))
    monkeypatch.setattr("litellm.completion", mock_completion)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/systems/extract")
    assert resp.status_code == 201
    doc = mock_db.systems.insert_one.call_args[0][0]
    labels = {n["label"] for n in doc["nodes"]}
    assert labels == {"Goblin", "Dodge Roll"}


def test_extract_does_not_clobber_existing_node_with_same_label(client, mock_db, monkeypatch):
    existing = _make_system_doc()  # nodes: Player, Enemy (data={})
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {
        "project_id": TEST_PROJECT_ID,
        "sections": {"overview": "test", "mechanics": "", "progression": ""},
    }
    mock_db.systems.find_one.side_effect = [existing, existing]

    extract_payload = {"nodes": [{"type": "entity", "label": "Player", "stats": {"hp": 9999}}]}
    mock_completion = MagicMock(return_value=_make_litellm_response(json.dumps(extract_payload)))
    monkeypatch.setattr("litellm.completion", mock_completion)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/systems/extract")
    assert resp.status_code == 200
    call_args = mock_db.systems.update_one.call_args
    updated_nodes = call_args[0][1]["$set"]["nodes"]
    player_nodes = [n for n in updated_nodes if n["label"] == "Player"]
    assert len(player_nodes) == 1
    assert player_nodes[0]["data"] == {}  # unchanged — existing node wins over LLM's hp: 9999


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
