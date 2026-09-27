"""
Integration tests for /projects/{id} routes.
Uses TestClient with MongoDB mocked (see conftest.py).
"""
from datetime import datetime
from bson import ObjectId

from tests.conftest import TEST_PROJECT_ID, TEST_PROJECT


def test_summary_returns_all_six_keys_with_partial_content(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.gdds.find_one.return_value = {
        "project_id": TEST_PROJECT_ID,
        "updated_at": datetime(2026, 1, 1),
    }
    mock_db.systems.find_one.return_value = None
    mock_db.unity_plans.find_one.return_value = None

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/summary")
    assert resp.status_code == 200
    body = resp.json()

    assert set(body.keys()) == {"gdd", "systems", "assets", "playtest", "unity", "deployment"}
    assert body["gdd"]["hasContent"] is True
    assert body["gdd"]["updatedAt"] is not None
    assert body["systems"]["hasContent"] is False
    assert body["systems"]["updatedAt"] is None
    assert body["assets"]["hasContent"] is False
    assert body["playtest"]["hasContent"] is False
    assert body["unity"]["hasContent"] is False
    assert body["deployment"]["hasContent"] is False


def test_summary_404_for_unknown_project(client, mock_db):
    mock_db.projects.find_one.return_value = None

    resp = client.get(f"/projects/{ObjectId()}/summary")
    assert resp.status_code == 404


def test_create_project_always_starts_at_pitch(client, mock_db):
    from unittest.mock import MagicMock

    doc = {**TEST_PROJECT, "stage": "pitch", "created_at": datetime(2026, 9, 25), "updated_at": datetime(2026, 9, 25)}
    mock_db.projects.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.projects.find_one.return_value = doc

    resp = client.post("/projects", json={"title": "New", "stage": "ship"})
    assert resp.status_code == 201
    inserted = mock_db.projects.insert_one.call_args[0][0]
    assert inserted["stage"] == "pitch"
    assert isinstance(inserted["stage_entered_at"], datetime)


def test_patch_cannot_change_stage(client, mock_db):
    mock_db.projects.find_one.return_value = {
        **TEST_PROJECT, "created_at": datetime(2026, 9, 25), "updated_at": datetime(2026, 9, 25),
    }
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}", json={"stage": "ship"})
    assert resp.status_code == 200
    mock_db.projects.update_one.assert_not_called()


def test_patch_saves_riskiest_assumption(client, mock_db):
    doc = {**TEST_PROJECT, "created_at": datetime(2026, 9, 25), "updated_at": datetime(2026, 9, 25)}
    mock_db.projects.find_one.return_value = {**doc, "riskiest_assumption": "Will it feel sad?", "risk_kind": "feel"}
    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}",
        json={"riskiestAssumption": "Will it feel sad?", "riskKind": "feel"},
    )
    assert resp.status_code == 200
    saved = mock_db.projects.update_one.call_args[0][1]["$set"]
    assert saved["riskiest_assumption"] == "Will it feel sad?"
    assert saved["risk_kind"] == "feel"
    assert resp.json()["riskKind"] == "feel"


def test_patch_rejects_unknown_risk_kind_and_long_assumption(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    assert client.patch(f"/projects/{TEST_PROJECT_ID}", json={"riskKind": "vibes"}).status_code == 422
    assert client.patch(
        f"/projects/{TEST_PROJECT_ID}", json={"riskiestAssumption": "x" * 501}
    ).status_code == 422


def test_patch_changes_genre(client, mock_db):
    doc = {**TEST_PROJECT, "created_at": datetime(2026, 9, 25), "updated_at": datetime(2026, 9, 25)}
    mock_db.projects.find_one.return_value = {**doc, "genre": "narrative"}
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}", json={"genre": "narrative"})
    assert resp.status_code == 200
    assert mock_db.projects.update_one.call_args[0][1]["$set"]["genre"] == "narrative"


def test_patch_rejects_unknown_genre(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}", json={"genre": "moba"})
    assert resp.status_code == 422


def test_patch_saves_player_settings(client, mock_db):
    doc = {**TEST_PROJECT, "created_at": datetime(2026, 9, 26), "updated_at": datetime(2026, 9, 26)}
    settings = {"look": "halftone", "chapterColors": {"1": "#2a3f5c"}, "textSpeedCps": 60,
                "wordmarkTitle": True, "ambience": True, "volume": 0.3,
                "twoCharacterStaging": False, "characterSides": {"Avery": "left", "Skyler": "right"}, "choiceRipple": False, "originalBackgrounds": ["title"]}
    mock_db.projects.find_one.return_value = {**doc, "player_settings": {
        "look": "halftone", "chapter_colors": {"1": "#2a3f5c"}, "text_speed_cps": 60,
        "wordmark_title": True, "ambience": True, "volume": 0.3,
        "two_character_staging": False, "character_sides": {"Avery": "left", "Skyler": "right"}, "choice_ripple": False, "original_backgrounds": ["title"]}}
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}", json={"playerSettings": settings})
    assert resp.status_code == 200
    saved = mock_db.projects.update_one.call_args[0][1]["$set"]["player_settings"]
    assert saved["text_speed_cps"] == 60 and saved["chapter_colors"] == {"1": "#2a3f5c"}
    assert saved["two_character_staging"] is False and saved["character_sides"] == {"Avery": "left", "Skyler": "right"}
    assert saved["choice_ripple"] is False
    assert resp.json()["playerSettings"] == settings


def test_player_settings_default_to_plain(client, mock_db):
    doc = {**TEST_PROJECT, "created_at": datetime(2026, 9, 26), "updated_at": datetime(2026, 9, 26)}
    mock_db.projects.find_one.return_value = doc
    body = client.patch(f"/projects/{TEST_PROJECT_ID}", json={}).json()
    assert body["playerSettings"] == {"look": "plain", "chapterColors": {}, "textSpeedCps": 40,
                                      "wordmarkTitle": False, "ambience": False, "volume": 0.5,
                                      "twoCharacterStaging": True, "characterSides": {}, "choiceRipple": True, "originalBackgrounds": []}


def test_player_settings_validation(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    bad = [{"look": "sepia"}, {"textSpeedCps": 5}, {"textSpeedCps": 121}, {"volume": 1.5},
           {"chapterColors": {"1": "blue"}}, {"chapterColors": {"1": "#12345"}},
           {"characterSides": {"Avery": "middle"}}, {"characterSides": {"": "left"}}, {"characterSides": {"x" * 41: "left"}}]
    for b in bad:
        assert client.patch(f"/projects/{TEST_PROJECT_ID}", json={"playerSettings": b}).status_code == 422, b
