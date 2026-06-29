"""
Integration tests for /projects/{id}/deployment and /projects/{id}/export routes.
LLM is mocked — no real network calls.
"""
import io
import json
import zipfile
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor, make_llm_response

CANNED_STORE_PAGE_JSON = json.dumps(
    {
        "title": "Test Game",
        "shortDescription": "A short punchy hook.",
        "longDescription": "A longer description with feature callouts.",
        "tags": ["rpg", "indie", "pixel-art"],
        "bullets": ["Deep combat system", "Branching dialogue"],
    }
)

CANNED_PRESS_KIT_JSON = json.dumps(
    {
        "tagline": "An epic RPG adventure.",
        "description": "Paragraph one.\n\nParagraph two.",
        "keyFeatures": ["Deep combat", "Branching dialogue", "Pixel art world"],
        "devBlurb": "The developer is an indie studio focused on narrative RPGs.",
    }
)

CANNED_BUILD_GUIDE_JSON = json.dumps(
    {
        "steps": [
            "File > Build Settings > select Windows, Mac, Linux",
            "Edit > Project Settings > Player > set Company Name and Product Name",
            "Set the default resolution under Resolution and Presentation",
        ]
    }
)


def _fake_deployment_doc(**overrides) -> dict:
    doc = {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "type": "storePage",
        "created_at": datetime.utcnow(),
        "platform": "steam",
        "title": "Test Game",
        "short_description": "A short punchy hook.",
        "long_description": "A longer description.",
        "tags": ["rpg"],
        "bullets": ["Deep combat"],
        "tagline": None,
        "description": None,
        "key_features": None,
        "dev_blurb": None,
        "build_platform": None,
        "unity_guide": None,
    }
    doc.update(overrides)
    return doc


# ─── GET list ─────────────────────────────────────────────────────────────────

def test_list_deployment_items_empty(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/deployment")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_deployment_items_404_when_project_missing(client, mock_db):
    mock_db.projects.find_one.return_value = None
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/deployment")
    assert resp.status_code == 404


def test_list_deployment_items_403_when_not_owner(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "user_id": str(ObjectId())}
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/deployment")
    assert resp.status_code == 403


# ─── POST /store-page ─────────────────────────────────────────────────────────

def test_create_store_page_returns_201(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_STORE_PAGE_JSON))
    )
    inserted = _fake_deployment_doc()
    mock_db.deployments.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.deployments.find_one.return_value = inserted

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/deployment/store-page",
        json={"platform": "steam"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "storePage"
    assert body["title"] == "Test Game"
    assert body["tags"] == ["rpg"]


def test_create_store_page_advances_stage(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "playtesting"}
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_STORE_PAGE_JSON))
    )
    inserted = _fake_deployment_doc()
    mock_db.deployments.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.deployments.find_one.return_value = inserted

    client.post(f"/projects/{TEST_PROJECT_ID}/deployment/store-page", json={"platform": "steam"})
    update_call = mock_db.projects.update_one.call_args
    assert update_call is not None
    assert update_call[0][1]["$set"]["stage"] == "deployment"


def test_create_store_page_never_regresses_stage(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "deployment"}
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_STORE_PAGE_JSON))
    )
    inserted = _fake_deployment_doc()
    mock_db.deployments.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.deployments.find_one.return_value = inserted

    client.post(f"/projects/{TEST_PROJECT_ID}/deployment/store-page", json={"platform": "steam"})
    mock_db.projects.update_one.assert_not_called()


def test_create_store_page_502_on_bad_llm_output(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response("not json")))
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/deployment/store-page", json={"platform": "steam"}
    )
    assert resp.status_code == 502


# ─── POST /press-kit ──────────────────────────────────────────────────────────

def test_create_press_kit_returns_201(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_PRESS_KIT_JSON))
    )
    inserted = _fake_deployment_doc(
        type="pressKit",
        platform=None,
        title=None,
        short_description=None,
        long_description=None,
        tags=None,
        bullets=None,
        tagline="An epic RPG adventure.",
        description="Paragraph one.\n\nParagraph two.",
        key_features=["Deep combat", "Branching dialogue", "Pixel art world"],
        dev_blurb="The developer is an indie studio focused on narrative RPGs.",
    )
    mock_db.deployments.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.deployments.find_one.return_value = inserted

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/deployment/press-kit", json={})
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "pressKit"
    assert body["tagline"] == "An epic RPG adventure."
    assert len(body["keyFeatures"]) == 3


# ─── POST /build-guide ────────────────────────────────────────────────────────

def test_create_build_guide_returns_201(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr(
        "litellm.completion", MagicMock(return_value=make_llm_response(CANNED_BUILD_GUIDE_JSON))
    )
    inserted = _fake_deployment_doc(
        type="buildGuide",
        platform=None,
        title=None,
        short_description=None,
        long_description=None,
        tags=None,
        bullets=None,
        build_platform="pc-windows",
        unity_guide={"steps": ["a", "b", "c"], "completed": [False, False, False]},
    )
    mock_db.deployments.insert_one.return_value = MagicMock(inserted_id=inserted["_id"])
    mock_db.deployments.find_one.return_value = inserted

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/deployment/build-guide", json={"platform": "pc-windows"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == "buildGuide"
    assert body["buildPlatform"] == "pc-windows"
    assert body["unityGuide"]["steps"] == ["a", "b", "c"]


def test_create_build_guide_502_on_bad_llm_output(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response("not json")))
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/deployment/build-guide", json={"platform": "pc-windows"}
    )
    assert resp.status_code == 502


# ─── PATCH guide / DELETE ─────────────────────────────────────────────────────

def test_update_guide_progress(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _fake_deployment_doc(
        type="buildGuide", unity_guide={"steps": ["a", "b"], "completed": [False, False]}
    )
    updated = {**doc, "unity_guide": {"steps": ["a", "b"], "completed": [True, False]}}
    mock_db.deployments.find_one.side_effect = [doc, updated]

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/deployment/{doc['_id']}/guide",
        json={"completed": [True, False]},
    )
    assert resp.status_code == 200
    assert resp.json()["unityGuide"]["completed"] == [True, False]


def test_update_guide_rejects_wrong_length(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _fake_deployment_doc(
        type="buildGuide", unity_guide={"steps": ["a", "b"], "completed": [False, False]}
    )
    mock_db.deployments.find_one.return_value = doc

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/deployment/{doc['_id']}/guide",
        json={"completed": [True]},
    )
    assert resp.status_code == 422


def test_update_guide_404_on_non_build_guide_item(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _fake_deployment_doc(type="storePage")
    mock_db.deployments.find_one.return_value = doc

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/deployment/{doc['_id']}/guide",
        json={"completed": [True]},
    )
    assert resp.status_code == 404


def test_delete_deployment_item_204(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.delete(f"/projects/{TEST_PROJECT_ID}/deployment/{ObjectId()}")
    assert resp.status_code == 204


def test_delete_deployment_item_404_when_missing(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.deployments.delete_one.return_value = MagicMock(deleted_count=0)
    resp = client.delete(f"/projects/{TEST_PROJECT_ID}/deployment/{ObjectId()}")
    assert resp.status_code == 404


# ─── GET /export ──────────────────────────────────────────────────────────────

def test_export_bundle_returns_zip(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {
        "project_id": TEST_PROJECT_ID,
        "sections": {"overview": "An epic RPG.", "mechanics": "Turn-based combat."},
    }
    mock_db.assets.find.return_value = make_cursor(
        [
            {
                "_id": ObjectId(),
                "project_id": TEST_PROJECT_ID,
                "type": "script",
                "name": "PlayerController",
                "code": "public class PlayerController {}",
                "unity_guide": {"steps": ["Attach to Player GameObject"], "completed": [False]},
            }
        ]
    )

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = zf.namelist()
    assert "GDD.md" in names
    assert "README.md" in names
    assert "Scripts/PlayerController.cs" in names
    assert "An epic RPG." in zf.read("GDD.md").decode()


def test_export_bundle_404_when_project_missing(client, mock_db):
    mock_db.projects.find_one.return_value = None
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/export")
    assert resp.status_code == 404
