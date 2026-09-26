"""Edit-through-GameGold: read-back sync records, PNG upload, template version, "Change something"."""
import base64
import json
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from tests.conftest import TEST_PROJECT_ID, TEST_PROJECT, make_cursor, make_llm_response

SHA = "a" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
PNG_URI = "data:image/png;base64," + base64.b64encode(PNG).decode()


# ─── Sync records (section 4) ────────────────────────────────────────────────

def test_record_sync_upserts_by_path(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    body = {"path": "Assets/Resources/GameGold/dialogue.json", "sha256": SHA, "source": "abc123"}
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/synced", json=body)
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["path"] == body["path"] and out["sha256"] == SHA and out["source"] == "abc123"
    assert "syncedAt" in out
    flt, update = mock_db.unity_syncs.update_one.call_args[0]
    assert flt == {"project_id": TEST_PROJECT_ID, "path": body["path"]}
    assert update["$set"]["sha256"] == SHA
    assert mock_db.unity_syncs.update_one.call_args.kwargs["upsert"] is True


def test_record_sync_keeps_runtime_version(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    body = {"path": "Assets/Scripts/DialoguePlayer.cs", "sha256": SHA, "source": "runtime", "version": 3}
    assert client.post(f"/projects/{TEST_PROJECT_ID}/unity/synced", json=body).json()["version"] == 3


def test_record_sync_rejects_bad_input(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    for bad in (
        {"path": "Assets/../x.json", "sha256": SHA, "source": "s"},
        {"path": "C:/x.json", "sha256": SHA, "source": "s"},
        {"path": "Assets/x.json", "sha256": "nothex", "source": "s"},
    ):
        assert client.post(f"/projects/{TEST_PROJECT_ID}/unity/synced", json=bad).status_code == 422
    mock_db.unity_syncs.update_one.assert_not_called()


def test_list_syncs(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.unity_syncs.find.return_value = make_cursor([{
        "_id": ObjectId(), "project_id": TEST_PROJECT_ID, "path": "Assets/Resources/GameGold/player_settings.json",
        "sha256": SHA, "source": "settings", "synced_at": datetime(2026, 9, 26),
    }])
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/unity/synced")
    assert resp.status_code == 200
    assert resp.json()[0]["source"] == "settings"
    assert mock_db.unity_syncs.find.call_args[0][0] == {"project_id": TEST_PROJECT_ID}


def test_sync_routes_check_ownership(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "user_id": "someone-else"}
    assert client.get(f"/projects/{TEST_PROJECT_ID}/unity/synced").status_code == 403


# ─── PNG upload → non-placeholder sprite (section 4 pull) ────────────────────

def _echo_insert(mock_db):
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=ObjectId())
    mock_db.assets.find_one.side_effect = lambda q: {
        "_id": q["_id"], **mock_db.assets.insert_one.call_args[0][0]
    }


def test_upload_sprite_creates_designer_owned_asset_without_llm(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    _echo_insert(mock_db)
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/assets/sprites/upload",
                       json={"name": "kitchen_night", "kind": "background", "dataUri": PNG_URI})
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["placeholder"] is False and out["kind"] == "background" and out["url"] == PNG_URI
    llm.assert_not_called()


def test_upload_sprite_rejects_non_png(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    for uri in ("data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64," + base64.b64encode(b"GIF89a").decode(),
                "data:image/png;base64,!!!"):
        resp = client.post(f"/projects/{TEST_PROJECT_ID}/assets/sprites/upload",
                           json={"name": "x", "kind": "sprite", "dataUri": uri})
        assert resp.status_code == 422, uri
    mock_db.assets.insert_one.assert_not_called()
