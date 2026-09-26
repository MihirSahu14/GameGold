"""Section 3: "Change something" — LLM plans bridge-only steps (never code/files). LLM mocked."""
import json
from unittest.mock import MagicMock

from tests.conftest import TEST_PROJECT_ID, TEST_PROJECT, make_llm_response


# ─── "Change something" (section 3) ──────────────────────────────────────────

def test_change_plans_steps_with_allowed_tools_only(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    ok = lambda i: {"description": f"step {i}", "tool": "component.setField", "category": "component",
                    "args": {"gameObjectName": "GameGold Dialogue", "componentType": "DialoguePlayer",
                             "field": "charsPerSecond", "value": "60"}}
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
