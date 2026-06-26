"""
Integration tests for /projects/{id}/assets routes.
LLM and Replicate are mocked — no real network calls.
"""
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from tests.conftest import (
    TEST_PROJECT,
    TEST_PROJECT_ID,
    TEST_USER_ID,
    make_cursor,
    make_llm_response,
)

CANNED_SCRIPT_JSON = json.dumps(
    {
        "code": "using UnityEngine;\n\npublic class PlayerController : MonoBehaviour {}",
        "unityGuide": [
            "Project panel > right-click Assets/Scripts > Create > C# Script > 'PlayerController'",
            "Replace the file contents with the generated code",
            "Select the Player GameObject in the Hierarchy",
            "Inspector > Add Component > search 'PlayerController'",
        ],
    }
)

CANNED_SPRITE_JSON = json.dumps(
    {
        "imagePrompt": "a small knight character, idle pose, transparent background",
        "unityGuide": [
            "Drag the file into Assets/Sprites/ in the Project panel",
            "Inspector > Texture Type > Sprite (2D and UI)",
            "Set Pixels Per Unit to 32",
        ],
    }
)

CANNED_DIALOGUE_JSON = json.dumps(
    {
        "tree": {
            "npcName": "Old Merchant",
            "personality": "grumpy but kind",
            "nodes": [
                {
                    "id": "start",
                    "speaker": "npc",
                    "text": "What do you want?",
                    "choices": [{"text": "Just browsing.", "next": "n2"}],
                },
                {"id": "n2", "speaker": "npc", "text": "Hmph. Fine.", "choices": []},
            ],
        },
        "unityGuide": [
            "Save the exported JSON into Assets/Dialogue/",
            "Create a DialogueManager script that loads the TextAsset",
        ],
    }
)


def _fake_asset_doc(**overrides) -> dict:
    doc = {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "type": "script",
        "name": "PlayerController",
        "description": "",
        "unity_guide": {"steps": ["a", "b"], "completed": [False, False]},
        "created_at": datetime.utcnow(),
        "url": None,
        "style": None,
        "image_prompt": None,
        "code": "public class PlayerController {}",
        "script_type": "PlayerController2D",
        "tree": None,
    }
    doc.update(overrides)
    return doc


# ─── GET list ─────────────────────────────────────────────────────────────────

def test_list_assets_empty(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/assets")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_assets_returns_camel_case(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.assets.find.return_value = make_cursor([_fake_asset_doc()])

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/assets")
    assert resp.status_code == 200
    body = resp.json()[0]
    assert body["projectId"] == TEST_PROJECT_ID
    assert body["scriptType"] == "PlayerController2D"
    assert body["unityGuide"]["steps"] == ["a", "b"]


def test_list_assets_404_when_project_missing(client, mock_db):
    mock_db.projects.find_one.return_value = None
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/assets")
    assert resp.status_code == 404


def test_list_assets_403_when_not_owner(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "user_id": str(ObjectId())}
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/assets")
    assert resp.status_code == 403


# ─── POST /scripts ────────────────────────────────────────────────────────────

def test_create_script_returns_201_with_code(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_SCRIPT_JSON))
    )

    inserted = _fake_asset_doc(code="using UnityEngine;\n\npublic class PlayerController : MonoBehaviour {}")
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.assets.find_one.return_value = inserted

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/scripts",
        json={"name": "PlayerController", "scriptType": "PlayerController2D", "description": ""},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "PlayerController" in body["code"]
    assert body["type"] == "script"
    assert body["unityGuide"]["completed"] == [False, False]


def test_create_script_advances_stage(client, mock_db, monkeypatch):
    """Project at 'gdd' moves forward to 'assets' on first asset."""
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "gdd"}
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_SCRIPT_JSON))
    )
    inserted = _fake_asset_doc()
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.assets.find_one.return_value = inserted

    client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/scripts",
        json={"name": "PlayerController"},
    )
    update_call = mock_db.projects.update_one.call_args
    assert update_call is not None
    assert update_call[0][1]["$set"]["stage"] == "assets"


def test_create_script_never_regresses_stage(client, mock_db, monkeypatch):
    """Project already at 'playtesting' must NOT move back to 'assets'."""
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "playtesting"}
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_SCRIPT_JSON))
    )
    inserted = _fake_asset_doc()
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.assets.find_one.return_value = inserted

    client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/scripts",
        json={"name": "PlayerController"},
    )
    mock_db.projects.update_one.assert_not_called()


def test_create_script_502_on_bad_llm_output(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response("not json"))
    )
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/scripts",
        json={"name": "PlayerController"},
    )
    assert resp.status_code == 502


# ─── POST /sprites ────────────────────────────────────────────────────────────

def test_create_sprite_400_without_replicate_token(client, mock_db, monkeypatch):
    """No REPLICATE_API_TOKEN configured → clear 400 error, not a crash."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_SPRITE_JSON))
    )
    monkeypatch.setattr("app.config.settings.replicate_api_token", "")

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/sprites",
        json={"name": "Knight", "description": "small knight", "style": "pixel"},
    )
    assert resp.status_code == 400
    assert "REPLICATE_API_TOKEN" in resp.json()["detail"]


def test_create_sprite_returns_201_with_data_uri(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_SPRITE_JSON))
    )
    monkeypatch.setattr(
        "app.routers.assets.generate_sprite_image",
        AsyncMock(return_value="data:image/png;base64,abc123"),
    )

    inserted = _fake_asset_doc(
        type="sprite",
        name="Knight",
        url="data:image/png;base64,abc123",
        style="pixel",
        image_prompt="a small knight",
        code=None,
        script_type=None,
    )
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.assets.find_one.return_value = inserted

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/sprites",
        json={"name": "Knight", "description": "small knight", "style": "pixel"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["url"].startswith("data:image/png;base64,")
    assert body["style"] == "pixel"


# ─── POST /dialogue ───────────────────────────────────────────────────────────

def test_create_dialogue_returns_tree(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_DIALOGUE_JSON))
    )

    inserted = _fake_asset_doc(
        type="dialogue",
        name="Old Merchant",
        code=None,
        script_type=None,
        tree={
            "npc_name": "Old Merchant",
            "personality": "grumpy but kind",
            "nodes": [
                {
                    "id": "start",
                    "speaker": "npc",
                    "text": "What do you want?",
                    "choices": [{"text": "Just browsing.", "next": "n2"}],
                }
            ],
        },
    )
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.assets.find_one.return_value = inserted

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/assets/dialogue",
        json={"npcName": "Old Merchant", "personality": "grumpy but kind"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["tree"]["npcName"] == "Old Merchant"
    assert body["tree"]["nodes"][0]["id"] == "start"


# ─── PATCH guide / DELETE ─────────────────────────────────────────────────────

def test_update_guide_progress(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _fake_asset_doc()
    updated = {**doc, "unity_guide": {"steps": ["a", "b"], "completed": [True, False]}}
    mock_db.assets.find_one.side_effect = [doc, updated]

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}/guide",
        json={"completed": [True, False]},
    )
    assert resp.status_code == 200
    assert resp.json()["unityGuide"]["completed"] == [True, False]


def test_update_guide_rejects_wrong_length(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _fake_asset_doc()  # 2 steps
    mock_db.assets.find_one.return_value = doc

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}/guide",
        json={"completed": [True]},
    )
    assert resp.status_code == 422


def test_delete_asset_204(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.delete(f"/projects/{TEST_PROJECT_ID}/assets/{ObjectId()}")
    assert resp.status_code == 204


def test_delete_asset_404_when_missing(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.assets.delete_one.return_value = MagicMock(deleted_count=0)
    resp = client.delete(f"/projects/{TEST_PROJECT_ID}/assets/{ObjectId()}")
    assert resp.status_code == 404
