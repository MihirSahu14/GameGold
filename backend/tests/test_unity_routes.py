"""
Integration tests for /projects/{id}/unity routes.
Uses TestClient with MongoDB mocked (see conftest.py).
"""
import io
import json
import zipfile
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from tests.conftest import TEST_PROJECT_ID, TEST_PROJECT, make_cursor, make_llm_response


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


CARD = {
    "title": "Test Game", "genre": "rpg", "platform": "pc", "core_loop": "Dash between beehives",
    "pillars": ["Tense", "Readable", "Short runs"], "wont_do": ["No multiplayer"],
}
SCRIPT = {"type": "script", "name": "Dasher", "code": "class Dasher {}"}


def test_generate_plan_409_without_core_loop(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 409
    llm.assert_not_called()


def test_generate_plan_prompt_is_pillars_goal_and_assets(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.assets.find.return_value = make_cursor([SCRIPT])
    plan = {"summary": "s", "steps": [{
        "description": "Add Rigidbody2D to Player, gravity scale 0", "tool": "component.add",
        "args": {"gameObjectName": "Player", "componentType": "Rigidbody2D"}, "category": "component",
    }]}
    llm = MagicMock(return_value=make_llm_response(json.dumps(plan)))
    monkeypatch.setattr("litellm.completion", llm)
    mock_db.unity_plans.find_one.side_effect = lambda q: {
        "_id": ObjectId(), **mock_db.unity_plans.replace_one.call_args[0][1]
    }

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 201
    system, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert "greybox" in system.lower()
    assert "Dash between beehives" in user
    assert "- Short runs" in user
    assert "Dasher (script)" in user
    mock_db.gdds.find_one.assert_not_called()


def test_export_build_pack_zip(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.unity_plans.find_one.return_value = _make_plan_doc()
    mock_db.assets.find.return_value = make_cursor([SCRIPT])

    resp = client.get(f"/projects/{TEST_PROJECT_ID}/unity/export")
    assert resp.status_code == 200
    assert "build_pack.zip" in resp.headers["content-disposition"]
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert zf.read("Scripts/Dasher.cs") == b"class Dasher {}"
    guide = zf.read("GAMEGOLD.md").decode()
    for text in ("Dash between beehives", "- Tense", "- No multiplayer", "`Scripts/Dasher.cs`",
                 "placeholder", "1. Create the main scene", "unity mcp", "CoplayDev/unity-mcp"):
        assert text in guide
    assert json.loads(zf.read("plan.json"))["steps"][0]["description"] == "Create the main scene"


def test_export_build_pack_without_plan_still_ships_the_brief(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.unity_plans.find_one.return_value = None
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/unity/export")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert "No build plan yet" in zf.read("GAMEGOLD.md").decode()
    assert json.loads(zf.read("plan.json"))["steps"] == []
