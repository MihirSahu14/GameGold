"""
Integration tests for /projects/{id}/playtest and /projects/{id}/bugs routes.
LLM is mocked — no real network calls.
"""
import json
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from tests.conftest import (
    TEST_PROJECT,
    TEST_PROJECT_ID,
    make_cursor,
    make_llm_response,
)

CANNED_PLAYTEST_JSON = json.dumps(
    {
        "summary": "Fun core loop but the mid-game drags badly for a casual player.",
        "playthroughLog": ["I started a new game.", "I skipped the tutorial.", "I got stuck."],
        "softlocks": ["No way back after entering the cave without the lamp."],
        "pacingIssues": ["Levels 3-5 reuse the same enemy with no new mechanic."],
        "difficultySpikes": ["Boss 2 doubles damage with no warning."],
        "funHighlights": ["The grapple hook felt great."],
        "balanceSuggestions": [
            {
                "issue": "Boss 2 damage spike",
                "fix": "Reduce contactDamage from 40 to 25",
                "unityPath": "Boss2 prefab > BossController component > contactDamage field",
            }
        ],
    }
)


def _fake_report_doc(**overrides) -> dict:
    doc = {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "persona": "casual",
        "summary": "Fun core loop but the mid-game drags badly for a casual player.",
        "playthrough_log": ["I started a new game."],
        "softlocks": ["No way back after entering the cave without the lamp."],
        "pacing_issues": [],
        "difficulty_spikes": [],
        "fun_highlights": [],
        "balance_suggestions": [
            {"issue": "Boss 2 damage spike", "fix": "Reduce contactDamage", "unity_path": "Boss2 prefab"}
        ],
        "created_at": datetime.utcnow(),
    }
    doc.update(overrides)
    return doc


def _fake_bug_doc(**overrides) -> dict:
    doc = {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "title": "Player clips through wall",
        "description": "Happens when dashing into corners",
        "severity": "high",
        "status": "open",
        "gdd_section": "mechanics",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    doc.update(overrides)
    return doc


# ─── POST /playtest/run ───────────────────────────────────────────────────────

def test_run_playtest_returns_201_report(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_PLAYTEST_JSON))
    )
    inserted = _fake_report_doc()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.playtests.find_one.return_value = inserted

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["persona"] == "casual"
    assert body["playthroughLog"] == ["I started a new game."]
    assert body["balanceSuggestions"][0]["unityPath"] == "Boss2 prefab"


def test_run_playtest_advances_stage(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "assets"}
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_PLAYTEST_JSON))
    )
    inserted = _fake_report_doc()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.playtests.find_one.return_value = inserted

    client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "hardcore"})
    update_call = mock_db.projects.update_one.call_args
    assert update_call[0][1]["$set"]["stage"] == "playtesting"


def test_run_playtest_includes_gdd_and_systems_context(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {
        "project_id": TEST_PROJECT_ID,
        "sections": {"overview": "Epic roguelike about bees", "mechanics": "Sting combos"},
    }
    mock_db.systems.find_one.return_value = {
        "project_id": TEST_PROJECT_ID,
        "nodes": [{"id": "n1", "type": "entity", "label": "QueenBee", "data": {}}],
        "edges": [],
    }
    mock_llm = MagicMock(return_value=make_llm_response(CANNED_PLAYTEST_JSON))
    monkeypatch.setattr("litellm.completion", mock_llm)
    inserted = _fake_report_doc()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.playtests.find_one.return_value = inserted

    client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    prompt_text = str(mock_llm.call_args)
    assert "Epic roguelike about bees" in prompt_text
    assert "QueenBee" in prompt_text


def test_run_playtest_502_on_bad_llm_output(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response("garbage"))
    )
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    assert resp.status_code == 502


def test_run_playtest_rejects_unknown_persona(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "griefer"}
    )
    assert resp.status_code == 422


# ─── GET /playtest ────────────────────────────────────────────────────────────

def test_list_reports(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.playtests.find.return_value = make_cursor([_fake_report_doc()])

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/playtest")
    assert resp.status_code == 200
    assert resp.json()[0]["projectId"] == TEST_PROJECT_ID


def test_delete_report_404_when_missing(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.playtests.delete_one.return_value = MagicMock(deleted_count=0)
    resp = client.delete(f"/projects/{TEST_PROJECT_ID}/playtest/{ObjectId()}")
    assert resp.status_code == 404


# ─── Bugs ─────────────────────────────────────────────────────────────────────

def test_create_bug_returns_201(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    inserted = _fake_bug_doc()
    mock_db.bugs.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.bugs.find_one.return_value = inserted

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/bugs",
        json={
            "title": "Player clips through wall",
            "description": "Happens when dashing into corners",
            "severity": "high",
            "gddSection": "mechanics",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "open"
    assert body["gddSection"] == "mechanics"


def test_list_bugs(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.bugs.find.return_value = make_cursor([_fake_bug_doc()])

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/bugs")
    assert resp.status_code == 200
    assert resp.json()[0]["title"] == "Player clips through wall"


def test_update_bug_status(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    updated = _fake_bug_doc(status="fixed")
    mock_db.bugs.find_one.return_value = updated

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/bugs/{updated['_id']}", json={"status": "fixed"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "fixed"


def test_update_bug_422_when_no_fields(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}/bugs/{ObjectId()}", json={})
    assert resp.status_code == 422


def test_update_bug_404_when_missing(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.bugs.update_one.return_value = MagicMock(matched_count=0)
    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/bugs/{ObjectId()}", json={"status": "fixed"}
    )
    assert resp.status_code == 404


def test_delete_bug_204(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.delete(f"/projects/{TEST_PROJECT_ID}/bugs/{ObjectId()}")
    assert resp.status_code == 204


def test_bugs_403_when_not_owner(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "user_id": str(ObjectId())}
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/bugs")
    assert resp.status_code == 403
