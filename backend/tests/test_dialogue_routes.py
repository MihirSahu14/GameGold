"""Narrative dialogue import + edit routes (gap 29). No LLM calls."""
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID

TREE = {
    "variables": {"anxiety": 0},
    "start": "a",
    "nodes": [
        {"id": "a", "speaker": "Avery", "text": "Hi", "bg": "kitchen", "choices": [
            {"text": "calm", "next": "end", "effects": {"anxiety": -1}},
        ]},
        {"id": "end", "speaker": "Narrator", "text": "Bye", "ending": "good"},
    ],
}
BROKEN = {**TREE, "nodes": [{"id": "a", "speaker": "", "text": "x", "next": "ghost"}]}


def _dialogue_doc(**over):
    return {
        "_id": ObjectId(), "project_id": TEST_PROJECT_ID, "type": "dialogue", "name": "Ripple",
        "description": "", "unity_guide": {"steps": [], "completed": []},
        "created_at": datetime.utcnow(), "tree": {"npc_name": "", "personality": "", "nodes": []},
        **over,
    }


def test_import_dialogue_creates_designer_asset_without_llm(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    doc = _dialogue_doc(tree=TREE, placeholder=False)
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.assets.find_one.return_value = doc

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/assets/dialogue/import", json={"name": "Ripple", "tree": TREE})
    assert resp.status_code == 201, resp.text
    llm.assert_not_called()
    inserted = mock_db.assets.insert_one.call_args[0][0]
    assert inserted["type"] == "dialogue" and inserted["placeholder"] is False
    assert inserted["tree"]["nodes"][0]["choices"][0]["effects"] == {"anxiety": -1}
    assert inserted["unity_guide"]["steps"]
    body = resp.json()
    assert body["tree"]["variables"] == {"anxiety": 0}
    assert body["tree"]["nodes"][1]["ending"] == "good"


def test_import_dialogue_422_with_validator_messages(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/assets/dialogue/import", json={"name": "R", "tree": BROKEN})
    assert resp.status_code == 422
    assert any("ghost" in m for m in resp.json()["detail"])
    mock_db.assets.insert_one.assert_not_called()


def test_put_tree_saves_valid_tree(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _dialogue_doc()
    mock_db.assets.find_one.side_effect = [doc, {**doc, "tree": TREE}]
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}/tree", json=TREE)
    assert resp.status_code == 200, resp.text
    filt, update = mock_db.assets.update_one.call_args[0]
    assert filt == {"_id": doc["_id"]}
    assert update["$set"]["tree"]["start"] == "a"
    assert resp.json()["tree"]["start"] == "a"


def test_put_tree_422_on_invalid(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _dialogue_doc()
    mock_db.assets.find_one.return_value = doc
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}/tree", json=BROKEN)
    assert resp.status_code == 422
    assert any("ghost" in m for m in resp.json()["detail"])
    mock_db.assets.update_one.assert_not_called()


def test_put_tree_404_for_non_dialogue_asset(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _dialogue_doc(type="script")
    mock_db.assets.find_one.return_value = doc
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}/tree", json=TREE)
    assert resp.status_code == 404


def test_put_tree_403_when_not_owner(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "user_id": "someone-else"}
    resp = client.put(f"/projects/{TEST_PROJECT_ID}/assets/{ObjectId()}/tree", json=TREE)
    assert resp.status_code == 403
