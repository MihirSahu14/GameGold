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
