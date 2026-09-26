"""Human playtest sessions — the only playtests that count toward stage gates."""
import json
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from bson import ObjectId

from app.prompts.playtest_prompt import PLAYTEST_SYNTHESIS_PROMPT
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor, make_llm_response

SESSION_BODY = {"testers": 4, "ring": "discord", "keptPlayingUnprompted": 2, "notes": "Nobody found the dash"}


def _session_doc(**overrides) -> dict:
    return {
        "_id": ObjectId(), "project_id": TEST_PROJECT_ID, "kind": "session", "testers": 4,
        "ring": "discord", "kept_playing_unprompted": 2, "notes": "Nobody found the dash",
        "created_at": datetime.utcnow(), **overrides,
    }


def test_log_session_stores_a_human_session(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _session_doc()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.playtests.find_one.return_value = doc

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions", json=SESSION_BODY)
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "session"
    assert body["persona"] is None
    assert body["keptPlayingUnprompted"] == 2
    stored = mock_db.playtests.insert_one.call_args[0][0]
    assert stored["kind"] == "session"
    assert stored["testers"] == 4


@pytest.mark.parametrize("patch", [
    {"ring": "coworkers"},
    {"testers": 0},
    {"keptPlayingUnprompted": 5},  # more than the 4 testers
    {"notes": "x" * 10001},
])
def test_log_session_validation(client, mock_db, patch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions", json={**SESSION_BODY, **patch})
    assert resp.status_code == 422
    mock_db.playtests.insert_one.assert_not_called()


def test_ai_run_is_stored_as_ai_persona(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {"project_id": TEST_PROJECT_ID, "sections": {"overview": "Bees."}}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps({"summary": "ok"}))))
    doc = {"_id": ObjectId(), "project_id": TEST_PROJECT_ID, "persona": "casual", "created_at": datetime.utcnow()}
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.playtests.find_one.return_value = doc

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/run", json={"persona": "casual"})
    assert resp.status_code == 201
    assert resp.json()["kind"] == "ai_persona"  # legacy-shaped doc defaults too
    assert mock_db.playtests.insert_one.call_args[0][0]["kind"] == "ai_persona"


def test_synthesize_409_without_session_notes(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.playtests.find.return_value = make_cursor([_session_doc(notes="  ")])
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions/synthesize")
    assert resp.status_code == 409
    llm.assert_not_called()


def test_synthesize_summarizes_only_human_notes(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.playtests.find.return_value = make_cursor([_session_doc(), _session_doc(notes="Loved the bees")])
    llm = MagicMock(return_value=make_llm_response("- 2 sessions: dash is undiscoverable"))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/playtest/sessions/synthesize")
    assert resp.status_code == 200
    assert resp.json() == {"summary": "- 2 sessions: dash is undiscoverable"}
    mock_db.playtests.find.assert_called_with({"project_id": TEST_PROJECT_ID, "kind": "session"})
    system, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert system == PLAYTEST_SYNTHESIS_PROMPT
    assert "Nobody found the dash" in user and "Loved the bees" in user
