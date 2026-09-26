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

# /playtest/run 409s without a GDD — give the LLM-path tests one.
GDD_DOC = {"project_id": TEST_PROJECT_ID, "sections": {"overview": "Epic roguelike about bees"}}

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
    mock_db.gdds.find_one.return_value = GDD_DOC
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
    mock_db.gdds.find_one.return_value = GDD_DOC
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


# ─── Context fallback (gap 48 — narrative games have no GDD) ─────────────────

DIALOGUE_TREE = {
    "npc_name": "Ripple",
    "personality": "wistful",
    "variables": {"anxiety": 0},
    "nodes": [
        {
            "id": "n1",
            "speaker": "Mara",
            "text": "The tide took the lighthouse keeper last winter, and no one talks about it.",
            "chapter": "Chapter 1",
            "choices": [
                {"text": "Ask what happened", "next": "n2", "effects": {"anxiety": 1}},
                {"text": "Say nothing", "next": "n3", "effects": {}},
            ],
        },
        {"id": "n2", "speaker": "Mara", "text": "She never says.", "branches": [{"when": "anxiety > 0", "next": "n4"}]},
        {"id": "n3", "speaker": "Mara", "text": "Some things are better left alone.", "ending": "neutral"},
    ],
}


def test_run_playtest_falls_back_to_dialogue_when_no_gdd(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None
    mock_db.assets.find.return_value = make_cursor(
        [{"project_id": TEST_PROJECT_ID, "type": "dialogue", "tree": DIALOGUE_TREE}]
    )
    mock_llm = MagicMock(return_value=make_llm_response(CANNED_PLAYTEST_JSON))
    monkeypatch.setattr("litellm.completion", mock_llm)
    inserted = _fake_report_doc()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.playtests.find_one.return_value = inserted

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    assert resp.status_code == 201
    prompt_text = str(mock_llm.call_args)
    assert "lighthouse keeper" in prompt_text
    assert "n1" in prompt_text


def test_run_playtest_409_when_nothing_to_play(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = None
    mock_db.assets.find.return_value = make_cursor([])
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    assert resp.status_code == 409
    assert "design doc" in resp.json()["detail"] or "story" in resp.json()["detail"]


def test_run_playtest_uses_concept_card_when_only_that_exists(client, mock_db, monkeypatch):
    project = {**TEST_PROJECT, "concept_card": {"unique_hook": "Grief told through tide pools", "pillars": ["No choice is labeled good or bad"], "wont_do": []}}
    mock_db.projects.find_one.return_value = project
    mock_db.gdds.find_one.return_value = None
    mock_db.assets.find.return_value = make_cursor([])
    mock_llm = MagicMock(return_value=make_llm_response(CANNED_PLAYTEST_JSON))
    monkeypatch.setattr("litellm.completion", mock_llm)
    inserted = _fake_report_doc()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.playtests.find_one.return_value = inserted

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    assert resp.status_code == 201
    assert "tide pools" in str(mock_llm.call_args)


# ─── GET /playtest/personas ───────────────────────────────────────────────────

def test_personas_classic_for_non_narrative_genre(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT  # genre: rpg
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/playtest/personas")
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert ids == ["casual", "hardcore", "speedrunner", "completionist"]


def test_personas_narrative_for_narrative_genre(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "narrative"}
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/playtest/personas")
    assert resp.status_code == 200
    ids = [p["id"] for p in resp.json()]
    assert ids == ["skimmer", "careful_reader", "choice_agonizer", "replayer"]


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
