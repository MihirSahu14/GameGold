"""POST /advance, GET /gates, POST /decision, PUT /checks — stage moves only on evidence."""
from datetime import datetime
from unittest.mock import AsyncMock

import pytest

from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor

NOW = datetime(2026, 9, 25)
FULL_CARD = {
    "title": "Test Game", "genre": "rpg", "platform": "pc", "unique_hook": "Bees rewind time",
    "pillars": ["Tense", "Readable", "Short runs"], "wont_do": ["No multiplayer"],
}


def _project(**overrides) -> dict:
    return {**TEST_PROJECT, "stage": "pitch", "created_at": NOW, "updated_at": NOW, **overrides}


def _set(mock_db) -> dict:
    return mock_db.projects.update_one.call_args[0][1]["$set"]


def test_gates_lists_missing_pitch_items(client, mock_db):
    mock_db.projects.find_one.return_value = _project()
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/gates")
    assert resp.status_code == 200
    assert resp.json() == {
        "stage": "pitch", "met": False, "total": 4,
        "missing": ["Write your hook", "Name exactly 3 pillars",
                    "List at least 1 thing the game won't do", "Pick a genre"],
    }


def test_gates_only_query_human_sessions(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype", prototype_decision="continue")
    mock_db.playtests.find.return_value = make_cursor([{"testers": 4, "ring": "discord", "created_at": NOW}])
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/gates")
    assert resp.json()["met"] is True
    mock_db.playtests.find.assert_called_with({"project_id": TEST_PROJECT_ID, "kind": "session"})


def test_advance_rejects_unmet_gate(client, mock_db):
    mock_db.projects.find_one.return_value = _project()
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/advance")
    assert resp.status_code == 409
    assert resp.json()["detail"].startswith("Gate not met: Write your hook")
    mock_db.projects.update_one.assert_not_called()


def test_advance_moves_to_next_stage_when_gate_met(client, mock_db):
    project = _project(concept_card=FULL_CARD)
    mock_db.projects.find_one = AsyncMock(side_effect=[project, {**project, "stage": "prototype"}])
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/advance")
    assert resp.status_code == 200
    assert resp.json()["stage"] == "prototype"
    assert _set(mock_db)["stage"] == "prototype"
    assert isinstance(_set(mock_db)["stage_entered_at"], datetime)


@pytest.mark.parametrize("stage", ["ship", "killed"])
def test_advance_has_nowhere_to_go(client, mock_db, stage):
    mock_db.projects.find_one.return_value = _project(stage=stage)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/advance")
    assert resp.status_code == 409
    mock_db.projects.update_one.assert_not_called()


def test_decision_kill_marks_project_killed(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype")
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "kill"})
    assert resp.status_code == 200
    assert _set(mock_db)["stage"] == "killed"
    assert _set(mock_db)["prototype_decision"] == "kill"


def test_decision_pivot_returns_to_pitch_and_clears_decision(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype", prototype_decision="continue")
    client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "pivot"})
    assert _set(mock_db)["stage"] == "pitch"
    assert _set(mock_db)["prototype_decision"] is None
    assert isinstance(_set(mock_db)["stage_entered_at"], datetime)


def test_decision_continue_records_without_moving(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype")
    client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "continue"})
    assert _set(mock_db)["prototype_decision"] == "continue"
    assert "stage" not in _set(mock_db)


def test_decision_outside_prototype_is_409(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="slice")
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "kill"})
    assert resp.status_code == 409
    mock_db.projects.update_one.assert_not_called()


def test_decision_rejects_unknown_value(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="prototype")
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/decision", json={"decision": "maybe"})
    assert resp.status_code == 422


def test_alpha_check_stamps_alpha_at(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="production")
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/checks", json={"key": "alpha_feature_lock", "value": True})
    assert resp.status_code == 200
    assert _set(mock_db)["gates.alpha_feature_lock"] is True
    assert isinstance(_set(mock_db)["alpha_at"], datetime)


def test_unticking_alpha_clears_alpha_at(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="production")
    client.put(f"/projects/{TEST_PROJECT_ID}/checks", json={"key": "alpha_feature_lock", "value": False})
    assert _set(mock_db)["alpha_at"] is None


def test_unknown_check_key_is_422(client, mock_db):
    mock_db.projects.find_one.return_value = _project(stage="production")
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/checks", json={"key": "vibes", "value": True})
    assert resp.status_code == 422
