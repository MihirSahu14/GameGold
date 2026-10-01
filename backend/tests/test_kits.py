"""Genre kit framework: registry, kit selection, generic data assets, runtime_plan. No LLM calls."""
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from app.kits.registry import KITS, Kit, is_available, kit_for_data_kind, kit_for_project, load_validator, missing_parts
from app.services.unity_service import kit_data_asset, runtime_plan
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor

GHOST = Kit("grid", "Ghost", "NoSuchRuntimeXyz", "levels", "Assets/Resources/GameGold/ghost.json", None,
            frozenset(), "app.services.no_such_validator_xyz", "no_such_sample_xyz.json")


# ─── Registry ────────────────────────────────────────────────────────────────

def test_registry_has_all_six_kits_with_unique_data_kinds():
    assert set(KITS) == {"narrative", "grid", "platformer", "arena_shooter", "card_battler", "fps"}
    kinds = [k.data_kind for k in KITS.values()]
    assert len(kinds) == len(set(kinds))
    for k in KITS.values():
        assert k.data_path.startswith("Assets/Resources/GameGold/") and k.data_path.endswith(".json")
        assert k.runtime_path == f"Assets/Scripts/{k.runtime_class}.cs"


def test_narrative_kit_is_available_and_validates_dialogue():
    kit = KITS["narrative"]
    assert is_available(kit), missing_parts(kit)
    validate = load_validator(kit)
    assert validate is not None
    assert validate({"nodes": [{"id": "a", "text": "hi", "ending": "good"}]}) == []
    assert validate({"nodes": [{"id": "a", "next": "ghost"}]})


def test_missing_template_validator_and_sample_mark_kit_unavailable():
    missing = missing_parts(GHOST)
    assert len(missing) == 3 and not is_available(GHOST)
    assert load_validator(GHOST) is None


def test_kit_for_data_kind():
    assert kit_for_data_kind("levels").id == "grid"
    assert kit_for_data_kind("cardgame").id == "card_battler"
    assert kit_for_data_kind("nope") is None


# ─── kit_for_project ─────────────────────────────────────────────────────────

def _kit(**project):
    k = kit_for_project(project)
    return k.id if k else None


def test_kit_from_genre():
    assert _kit(genre="narrative") == "narrative"
    assert _kit(genre="visual-novel") == "narrative"
    assert _kit(genre="platformer") == "platformer"
    assert _kit(genre="puzzle") == "grid"
    assert _kit(genre="shooter") == "arena_shooter"
    assert _kit(genre="card-battler") == "card_battler"
    assert _kit(genre="fps") == "fps"
    assert _kit(genre="strategy") is None
    assert _kit(genre="rpg") is None


def test_first_person_shooter_pitch_picks_fps():
    assert _kit(genre="shooter", concept_card={"tagline": "A first-person arena brawler"}) == "fps"
    assert _kit(genre="shooter", concept_card={"core_loop": "Classic FPS: shoot drones"}) == "fps"
    assert _kit(genre="shooter", concept_card={"core_loop": "twin-stick, top-down"}) == "arena_shooter"


def test_override_beats_genre_and_bad_override_is_ignored():
    assert _kit(genre="narrative", kit="grid") == "grid"
    assert _kit(genre="strategy", kit="card_battler") == "card_battler"
    assert _kit(genre="puzzle", kit="bogus") == "grid"


def test_patch_sets_and_clears_kit_override(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}", json={"kit": "grid", "kitSettings": {"grid": {"moveSeconds": 0.1}}})
    assert resp.status_code == 200, resp.text
    sets = mock_db.projects.update_one.call_args[0][1]["$set"]
    assert sets["kit"] == "grid" and sets["kit_settings.grid"] == {"moveSeconds": 0.1}

    client.patch(f"/projects/{TEST_PROJECT_ID}", json={"kit": None, "unityProjectName": "RippleGG"})
    sets = mock_db.projects.update_one.call_args[0][1]["$set"]
    assert sets["kit"] is None and sets["unity_project_name"] == "RippleGG"

    assert client.patch(f"/projects/{TEST_PROJECT_ID}", json={"kit": "bogus"}).status_code == 422


def test_project_kit_endpoint(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "visual-novel"}
    body = client.get(f"/projects/{TEST_PROJECT_ID}/unity/kit").json()
    assert body["kit"]["id"] == "narrative" and body["kit"]["available"] is True
    assert body["kit"]["runtimeClass"] == "DialoguePlayer" and body["overridden"] is False

    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "strategy"}
    assert client.get(f"/projects/{TEST_PROJECT_ID}/unity/kit").json() == {"kit": None, "overridden": False}


def test_kit_list_and_sample_404(client):
    kits = client.get("/unity/kits").json()
    assert {k["id"] for k in kits} == set(KITS)
    assert all("available" in k and "missing" in k for k in kits)
    assert client.get("/unity/kits/narrative/sample").status_code == 404  # narrative ships no sample


def test_agent_playtest_accepts_any_bridge_port():
    import pytest
    from app.models.playtest import AgentRunCreate

    for port in (7432, 7433, 7439):
        AgentRunCreate(url=f"http://localhost:{port}/play/index.html", personas=["first_timer"])
    with pytest.raises(ValueError):
        AgentRunCreate(url="http://localhost:7440/play/index.html", personas=["first_timer"])


# ─── Generic data asset ──────────────────────────────────────────────────────

LEVELS = {"levels": [{"name": "1", "rows": ["#####", "#@$.#", "#####"]}]}


def _fake_validator(monkeypatch):
    def validate(data):
        return [] if data.get("levels") else ["levels: need at least one level"]
    monkeypatch.setattr("app.routers.assets.load_validator", lambda kit: validate)


def _data_doc(**over):
    return {
        "_id": ObjectId(), "project_id": TEST_PROJECT_ID, "type": "data", "name": "Dockside", "kind": "levels",
        "description": "", "unity_guide": {"steps": [], "completed": []}, "created_at": datetime.utcnow(),
        "data": LEVELS, "placeholder": False, **over,
    }


def test_import_data_runs_kit_validator(client, mock_db, monkeypatch):
    _fake_validator(monkeypatch)
    mock_db.projects.find_one.return_value = TEST_PROJECT
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    doc = _data_doc()
    mock_db.assets.insert_one.return_value = MagicMock(inserted_id=doc["_id"])
    mock_db.assets.find_one.return_value = doc

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/assets/data/import",
                       json={"name": "Dockside", "kind": "levels", "data": LEVELS})
    assert resp.status_code == 201, resp.text
    llm.assert_not_called()
    inserted = mock_db.assets.insert_one.call_args[0][0]
    assert inserted["type"] == "data" and inserted["kind"] == "levels" and inserted["data"] == LEVELS
    assert inserted["placeholder"] is False and any("levels.json" in s for s in inserted["unity_guide"]["steps"])
    assert resp.json()["data"] == LEVELS and resp.json()["kind"] == "levels"


def test_import_data_422_with_error_list(client, mock_db, monkeypatch):
    _fake_validator(monkeypatch)
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/assets/data/import",
                       json={"name": "D", "kind": "levels", "data": {"levels": []}})
    assert resp.status_code == 422
    assert resp.json()["detail"] == ["levels: need at least one level"]
    mock_db.assets.insert_one.assert_not_called()


def test_import_data_validator_crash_is_422(client, mock_db, monkeypatch):
    monkeypatch.setattr("app.routers.assets.load_validator", lambda kit: lambda data: data["missing"])
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/assets/data/import", json={"name": "D", "kind": "levels", "data": {}})
    assert resp.status_code == 422


def test_import_data_409_without_validator_and_422_for_unknown_kind(client, mock_db, monkeypatch):
    monkeypatch.setattr("app.routers.assets.load_validator", lambda kit: None)
    mock_db.projects.find_one.return_value = TEST_PROJECT
    url = f"/projects/{TEST_PROJECT_ID}/assets/data/import"
    assert client.post(url, json={"name": "D", "kind": "levels", "data": LEVELS}).status_code == 409
    assert client.post(url, json={"name": "D", "kind": "dialogue", "data": {}}).status_code == 422


def test_put_data_validates_and_saves(client, mock_db, monkeypatch):
    _fake_validator(monkeypatch)
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _data_doc()
    mock_db.assets.find_one.return_value = doc
    url = f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}/data"

    assert client.put(url, json={"levels": []}).status_code == 422
    mock_db.assets.update_one.assert_not_called()

    assert client.put(url, json=LEVELS).status_code == 200
    assert mock_db.assets.update_one.call_args[0][1] == {"$set": {"data": LEVELS}}


def test_put_data_404_for_non_data_asset(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _data_doc(type="dialogue")
    mock_db.assets.find_one.return_value = doc
    assert client.put(f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}/data", json=LEVELS).status_code == 404


# ─── runtime_plan ────────────────────────────────────────────────────────────

SPRITE = {"_id": ObjectId(), "type": "sprite", "name": "crate/1", "kind": "sprite", "url": "data:image/png;base64,x"}


def test_kit_data_asset_matches_kind_and_prefers_newest():
    assets = [_data_doc(name="Old", created_at=datetime(2020, 1, 1)), _data_doc(name="New"), _data_doc(name="Cards", kind="cardgame")]
    assert kit_data_asset(KITS["grid"], assets)["name"] == "New"
    assert kit_data_asset(KITS["card_battler"], assets)["name"] == "Cards"
    assert kit_data_asset(KITS["platformer"], assets) is None


def test_runtime_plan_steps():
    kit = KITS["platformer"]
    assets = [_data_doc(name="Old", kind="platformer_levels", created_at=datetime(2020, 1, 1)),
              _data_doc(name="Ember Hop", kind="platformer_levels"), SPRITE]
    summary, steps = runtime_plan(kit, assets)
    assert "Ember Hop" in summary
    assert [(s.tool, s.args) for s in steps] == [
        ("scene.new", {"name": "Game", "saveCurrent": True}),
        ("packages.ensure", {"names": ["com.unity.ugui"]}),
        ("asset.createScript", {"className": "PlatformerRunner", "path": "Assets/Scripts/PlatformerRunner.cs"}),
        ("asset.createText", {"data": "Ember Hop", "path": kit.data_path}),
        ("asset.importSprite", {"name": "crate/1", "path": "Assets/Resources/GameGold/Sprites/crate_1.png"}),
        ("editor.awaitCompile", {}),
        ("gameobject.create", {"name": "GameGold Platformer"}),
        ("component.add", {"gameObjectName": "GameGold Platformer", "componentType": "PlatformerRunner"}),
        ("playmode.enter", {}),
    ]
    assert [s.step_number for s in steps] == list(range(1, 10))


def test_runtime_plan_skips_settings_step_without_settings_path():
    kit = KITS["platformer"]  # settings live inside the levels file
    _, steps = runtime_plan(kit, [_data_doc(kind="platformer_levels")])
    assert not any("kitSettings" in s.args for s in steps)
    assert len(steps) == 8


def test_runtime_plan_writes_settings_when_kit_has_settings_file():
    kit = KITS["grid"]
    _, steps = runtime_plan(kit, [_data_doc()])
    assert ("asset.createText", {"kitSettings": "grid", "path": kit.settings_path}) in [(s.tool, s.args) for s in steps]


def test_plan_endpoint_uses_runtime_plan_when_kit_available(client, mock_db, monkeypatch):
    monkeypatch.setattr("app.routers.unity.is_available", lambda kit: True)
    llm = MagicMock()
    monkeypatch.setattr("litellm.completion", llm)
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "puzzle"}
    mock_db.assets.find.return_value = make_cursor([_data_doc()])
    mock_db.unity_plans.find_one.side_effect = lambda q: {
        "_id": ObjectId(), **mock_db.unity_plans.replace_one.call_args[0][1]
    }
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 201, resp.text
    llm.assert_not_called()
    assert resp.json()["steps"][2]["args"]["className"] == "GridPlayer"


def test_plan_endpoint_409_when_kit_has_no_data(client, mock_db, monkeypatch):
    monkeypatch.setattr("app.routers.unity.is_available", lambda kit: True)
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "puzzle"}
    mock_db.assets.find.return_value = make_cursor([])
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 409 and "Game data" in resp.json()["detail"]


def test_plan_endpoint_falls_back_to_llm_when_kit_unavailable(client, mock_db, monkeypatch):
    monkeypatch.setattr("app.routers.unity.is_available", lambda kit: False)
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "genre": "puzzle"}
    mock_db.assets.find.return_value = make_cursor([_data_doc()])
    # no core loop → the LLM path's own 409, proving the kit path was skipped
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/plan/generate")
    assert resp.status_code == 409 and "core loop" in resp.json()["detail"]
