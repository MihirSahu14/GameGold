"""
Integration tests for /projects/{id}/unity routes.
Uses TestClient with MongoDB mocked (see conftest.py).
"""
from datetime import datetime
from bson import ObjectId

from tests.conftest import TEST_PROJECT_ID, TEST_PROJECT


def _make_plan_doc() -> dict:
    return {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "steps": [
            {
                "step_number": 1,
                "description": "Create the main scene",
                "tool": "scene.create",
                "args": {},
                "category": "scene",
                "completed": False,
            },
        ],
        "summary": "Build the game",
        "generated_at": datetime.utcnow(),
    }


def test_get_plan_404_when_none(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.unity_plans.find_one.return_value = None

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/unity/plan")
    assert resp.status_code == 404


def test_mark_step_accepts_camel_case_body(client, mock_db):
    """Frontend sends {stepNumber, completed} — must not 422."""
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.unity_plans.find_one.return_value = _make_plan_doc()

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/unity/plan/step",
        json={"stepNumber": 1, "completed": True},
    )
    assert resp.status_code == 200
    set_steps = mock_db.unity_plans.update_one.call_args[0][1]["$set"]["steps"]
    assert set_steps[0]["completed"] is True


def test_mark_step_unknown_step_404(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.unity_plans.find_one.return_value = _make_plan_doc()

    resp = client.patch(
        f"/projects/{TEST_PROJECT_ID}/unity/plan/step",
        json={"stepNumber": 99, "completed": True},
    )
    assert resp.status_code == 404


def test_invalid_project_id_returns_404(client, mock_db):
    resp = client.get("/projects/not-an-objectid/unity/plan")
    assert resp.status_code == 404
