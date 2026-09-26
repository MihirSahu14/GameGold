"""Section 3: "Change something" — LLM plans bridge-only steps (never code/files). LLM mocked."""
import json
from unittest.mock import MagicMock

from tests.conftest import TEST_PROJECT_ID, TEST_PROJECT, make_llm_response


# ─── "Change something" (section 3) ──────────────────────────────────────────

def test_change_plans_steps_with_allowed_tools_only(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    # dialoguePath isn't a Player Settings field, so it survives the gap-45 strip (unlike charsPerSecond).
    ok = lambda i: {"description": f"step {i}", "tool": "component.setField", "category": "component",
                    "args": {"gameObjectName": "GameGold Dialogue", "componentType": "DialoguePlayer",
                             "field": "dialoguePath", "value": "GameGold/dialogue2"}}
    steps = [
        {"description": "write code", "tool": "asset.createScript", "args": {"className": "X", "code": "class X{}"}},
        {"description": "bad", "tool": "asset.createText", "args": {"path": "Assets/x.json", "content": "{}"}},
        {"description": "unknown", "tool": "shell.exec", "args": {}},
        *[ok(i) for i in range(15)],
    ]
    llm = MagicMock(return_value=make_llm_response(json.dumps({"summary": "Faster text", "steps": steps})))
    monkeypatch.setattr("litellm.completion", llm)

    snapshot = {"scene": "Story", "objects": [{"name": "GameGold Dialogue", "components": ["DialoguePlayer"]}],
                "blob": "x" * 20000}
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/change",
                       json={"request": "Make the text type faster", "snapshot": snapshot})
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["summary"] == "Faster text"
    assert len(out["steps"]) == 12
    assert {s["tool"] for s in out["steps"]} == {"component.setField"}
    assert [s["stepNumber"] for s in out["steps"]] == list(range(1, 13))
    assert all(s["completed"] is False for s in out["steps"])

    system, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert "createScript" in system  # the prompt names what's forbidden
    assert "Make the text type faster" in user
    assert "GameGold Dialogue" in user
    assert len(user) < 8000  # snapshot trimmed to ~6k chars
    mock_db.unity_plans.replace_one.assert_not_called()  # not persisted as the plan


def test_change_502_when_nothing_usable(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    bad = {"steps": [{"description": "code", "tool": "asset.createScript", "args": {}}]}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps(bad))))
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/change", json={"request": "Add a boss", "snapshot": {}})
    assert resp.status_code == 502


def test_change_requires_a_request(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    assert client.post(f"/projects/{TEST_PROJECT_ID}/unity/change", json={"request": "  ", "snapshot": {}}).status_code == 422


# ─── Gap 45: Player Settings vs component fields (two sources of truth) ──────

def test_change_accepts_a_valid_settings_patch(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT  # no player_settings -> defaults (textSpeedCps 40)
    body = {"summary": "Slower typing", "settingsPatch": {"textSpeedCps": 20}, "steps": []}
    llm = MagicMock(return_value=make_llm_response(json.dumps(body)))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/change",
                        json={"request": "Slower typing", "snapshot": {}})
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["settingsPatch"] == {"textSpeedCps": 20}
    assert out["steps"] == []

    _, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert '"textSpeedCps":40' in user.replace(" ", "")  # current settings shown to the LLM


def test_change_drops_an_invalid_settings_patch(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    body = {"summary": "Bad", "settingsPatch": {"textSpeedCps": 9999}, "steps": [
        {"description": "x", "tool": "gameobject.create", "args": {"name": "X"}},
    ]}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps(body))))
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/change", json={"request": "go faster", "snapshot": {}})
    assert resp.status_code == 200, resp.text
    assert resp.json()["settingsPatch"] is None


def test_change_strips_setfield_on_a_settings_owned_dialogueplayer_field(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    body = {"summary": "Slower typing", "steps": [
        {"description": "set speed", "tool": "component.setField",
         "args": {"gameObjectName": "GameGold Dialogue", "componentType": "DialoguePlayer",
                  "field": "charsPerSecond", "value": "20"}},
        {"description": "keep this one", "tool": "gameobject.create", "args": {"name": "X"}},
    ]}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps(body))))
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/change", json={"request": "slower typing", "snapshot": {}})
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert [s["tool"] for s in out["steps"]] == ["gameobject.create"]
    assert out["steps"][0]["stepNumber"] == 1  # renumbered after the strip


def test_change_502_when_strip_leaves_nothing_and_no_settings_patch(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    body = {"summary": "no-op", "steps": [
        {"description": "set speed", "tool": "component.setField",
         "args": {"gameObjectName": "GameGold Dialogue", "componentType": "DialoguePlayer",
                  "field": "charsPerSecond", "value": "20"}},
    ]}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(json.dumps(body))))
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/unity/change", json={"request": "slower typing", "snapshot": {}})
    assert resp.status_code == 502
