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
                 "placeholder", "1. Create the main scene", "unity mcp", "CoplayDev/unity-mcp",
                 "winget install Unity.CLI", "unity pipeline install", "unity mcp configure claude",
                 "AssetDatabase.Refresh()", "unity recompile", "Console", "focus the Editor"):
        assert text in guide
    assert json.loads(zf.read("plan.json"))["steps"][0]["description"] == "Create the main scene"


def test_export_build_pack_without_plan_still_ships_the_brief(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.unity_plans.find_one.return_value = None
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/unity/export")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert "No build plan yet" in zf.read("GAMEGOLD.md").decode()
    assert json.loads(zf.read("plan.json"))["steps"] == []


# ─── Narrative plan: deterministic, GameGold's own DialoguePlayer (#28) ──────

NARRATIVE_ASSETS = [
    {"type": "dialogue", "name": "AI Merchant", "placeholder": True, "created_at": datetime(2026, 9, 1)},
    {"type": "dialogue", "name": "Ripple", "placeholder": False, "created_at": datetime(2026, 9, 2)},
    {"type": "sprite", "kind": "background", "name": "kitchen_morning", "url": "data:image/png;base64,AA"},
    {"type": "sprite", "kind": "portrait", "name": "Avery", "url": "data:image/png;base64,AA"},
    {"type": "sprite", "kind": "sprite", "name": "Coin", "url": "data:image/png;base64,AA"},
]


def _saving_plans(mock_db):
    mock_db.unity_plans.find_one.side_effect = lambda q: {
        "_id": ObjectId(), **mock_db.unity_plans.replace_one.call_args[0][1]
    }


def test_narrative_plan_is_deterministic_without_llm(client, mock_db, monkeypatch):
    # no core loop needed either — the plan doesn't depend on it
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "visual-novel"}
    mock_db.assets.find.return_value = make_cursor(NARRATIVE_ASSETS)
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    _saving_plans(mock_db)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 201, resp.text
    llm.assert_not_called()
    steps = resp.json()["steps"]
    assert [(s["tool"], s["args"]) for s in steps] == [
        ("scene.new", {"name": "Story"}),
        ("asset.createScript", {"className": "DialoguePlayer", "path": "Assets/Scripts/DialoguePlayer.cs"}),
        ("asset.createText", {"dialogue": "Ripple", "path": "Assets/Resources/GameGold/dialogue.json"}),
        ("asset.importSprite", {"name": "kitchen_morning", "path": "Assets/Resources/GameGold/Backgrounds/kitchen_morning.png"}),
        ("asset.importSprite", {"name": "Avery", "path": "Assets/Resources/GameGold/Portraits/Avery.png"}),
        ("gameobject.create", {"name": "GameGold Dialogue"}),
        ("component.add", {"gameObjectName": "GameGold Dialogue", "componentType": "DialoguePlayer"}),
        ("playmode.enter", {}),
    ]
    assert [s["stepNumber"] for s in steps] == list(range(1, 9))
    assert all(s["description"] and "." not in s["description"].split()[0] for s in steps)
    assert resp.json()["missingScripts"] == []


def test_narrative_plan_409_without_dialogue(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "narrative"}
    mock_db.assets.find.return_value = make_cursor([NARRATIVE_ASSETS[2]])
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 409
    assert "dialogue" in resp.json()["detail"].lower()


def test_llm_plan_reports_missing_scripts(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    mock_db.assets.find.return_value = make_cursor([SCRIPT])
    add = lambda t: {"description": f"Add {t}", "tool": "component.add",
                     "args": {"gameObjectName": "Player", "componentType": t}, "category": "component"}
    plan = {"summary": "s", "steps": [add("Rigidbody2D"), add("UnityEngine.UI.Image"), add("Dasher"),
                                      add("TraitTracker"), add("TraitTracker"), add("ChapterManager")]}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps(plan))))
    _saving_plans(mock_db)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 201
    assert resp.json()["missingScripts"] == ["TraitTracker", "ChapterManager"]


def test_old_plan_docs_default_missing_scripts(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.unity_plans.find_one.return_value = _make_plan_doc()
    assert client.get(f"/projects/{TEST_PROJECT_ID}/unity/plan").json()["missingScripts"] == []


def test_narrative_scaffold_describes_the_builtin_runtime():
    from app.prompts.unity_prompt import NARRATIVE_SCAFFOLD, UNITY_PLAN_SYSTEM_PROMPT

    for text in ("DialoguePlayer", "Assets/Resources/GameGold/dialogue.json",
                 "Resources/GameGold/Backgrounds", "Resources/GameGold/Portraits", "GameGold Dialogue"):
        assert text in NARRATIVE_SCAFFOLD
    assert "greybox" in UNITY_PLAN_SYSTEM_PROMPT.lower()


def test_build_pack_includes_narrative_scaffold_only_for_narrative(client, mock_db):
    mock_db.unity_plans.find_one.return_value = None
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "visual-novel", "concept_card": CARD}
    zf = zipfile.ZipFile(io.BytesIO(client.get(f"/projects/{TEST_PROJECT_ID}/unity/export").content))
    assert "Narrative scaffold" in zf.read("GAMEGOLD.md").decode()
    assert b"public class DialoguePlayer" in zf.read("Scripts/DialoguePlayer.cs")

    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    zf = zipfile.ZipFile(io.BytesIO(client.get(f"/projects/{TEST_PROJECT_ID}/unity/export").content))
    assert "Narrative scaffold" not in zf.read("GAMEGOLD.md").decode()
    assert "Scripts/DialoguePlayer.cs" not in zf.namelist()
