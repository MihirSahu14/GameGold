"""Agent playthroughs of the live build: run limits, step validation, action parsing +
coordinate scaling, frames, the agent_play report, no project data in prompts, gates,
estimate, complete_vision. LiteLLM is always mocked."""
import asyncio
import base64
import json
from datetime import datetime
from unittest.mock import MagicMock

import pytest
from bson import ObjectId
from cryptography.fernet import Fernet

from app.config import settings
from app.main import app
from app.routers.auth import get_current_user
from app.services.llm_keys import encrypt_key
from app.services.llm_utils import complete_vision, current_llm_user
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, TEST_USER, TEST_USER_ID, make_cursor, make_llm_response

BASE = f"/projects/{TEST_PROJECT_ID}/playtest"
JPEG = base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 200).decode()
RUN_ID = ObjectId()
PROJECT = {
    **TEST_PROJECT, "title": "Zorblax Odyssey",
    "concept_card": {"unique_hook": "Bees rewind time", "pillars": ["Tense"]},
    "home": {"pitch": "A secret pitch about moon pirates"},
}
SECRETS = ["Zorblax Odyssey", "Bees rewind time", "moon pirates", "GDD overview text"]


@pytest.fixture(autouse=True)
def vision_trial_model(monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "anthropic/claude-haiku-4-5")
    monkeypatch.setattr("litellm.completion_cost", MagicMock(return_value=0.001))


@pytest.fixture
def llm(monkeypatch):
    completion = MagicMock()
    monkeypatch.setattr("litellm.completion", completion)
    return completion


@pytest.fixture
def project(mock_db):
    mock_db.projects.find_one.return_value = PROJECT
    mock_db.gdds.find_one.return_value = {"project_id": TEST_PROJECT_ID, "sections": {"overview": "GDD overview text"}}
    return PROJECT


def _run_doc(**overrides) -> dict:
    return {
        "_id": RUN_ID, "project_id": TEST_PROJECT_ID, "user_id": TEST_USER_ID,
        "url": "https://mihir.itch.io/ripple", "agents": ["first_timer"], "custom": "",
        "max_steps": 15, "using_own_key": False, "steps_used": {}, "bad_reads": {}, "finished": [],
        "created_at": datetime.utcnow(), **overrides,
    }


def _step(**overrides) -> dict:
    return {
        "agent": "first_timer", "n": 1, "jpegBase64": JPEG, "pageUrl": "https://mihir.itch.io/ripple",
        "screenWidth": 1024, "screenHeight": 576, "viewportWidth": 1280, "viewportHeight": 720, **overrides,
    }


def _own_key_user(model: str = "openai/gpt-4o") -> dict:
    return {**TEST_USER, "llm": {"provider": "openai", "model": model, "key_encrypted": "x", "key_last4": "abcd"}}


# ─── Run creation ────────────────────────────────────────────────────────────

def test_trial_run_is_one_first_timer_for_15_steps(client, mock_db, project):
    mock_db.agent_runs.insert_one.return_value = MagicMock(inserted_id=RUN_ID)
    resp = client.post(f"{BASE}/agent-runs", json={
        "url": "https://mihir.itch.io/ripple", "personas": ["impatient", "poker", "custom"], "custom": "A toddler",
    })
    assert resp.status_code == 201
    assert resp.json() == {"runId": str(RUN_ID), "maxSteps": 15, "agents": ["first_timer"], "usingOwnKey": False}
    stored = mock_db.agent_runs.insert_one.call_args[0][0]
    assert stored["agents"] == ["first_timer"] and stored["max_steps"] == 15
    assert stored["user_id"] == TEST_USER_ID and stored["custom"] == ""


def test_own_key_run_keeps_personas_for_40_steps(client, mock_db, project):
    app.dependency_overrides[get_current_user] = _own_key_user
    mock_db.agent_runs.insert_one.return_value = MagicMock(inserted_id=RUN_ID)
    resp = client.post(f"{BASE}/agent-runs", json={
        "url": "http://localhost:7432/play/index.html", "personas": ["first_timer", "poker", "custom"], "custom": " A toddler ",
    })
    assert resp.status_code == 201
    assert resp.json() == {"runId": str(RUN_ID), "maxSteps": 40, "agents": ["first_timer", "poker", "custom"], "usingOwnKey": True}
    assert mock_db.agent_runs.insert_one.call_args[0][0]["custom"] == "A toddler"


def test_run_rejects_a_model_that_cant_see(client, mock_db, project, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "groq/llama-3.3-70b-versatile")
    resp = client.post(f"{BASE}/agent-runs", json={"url": "https://a.io/g", "personas": ["first_timer"]})
    assert resp.status_code == 400
    assert "can't see images" in resp.json()["detail"]
    mock_db.agent_runs.insert_one.assert_not_called()


@pytest.mark.parametrize("body", [
    {"url": "http://example.com/game", "personas": ["first_timer"]},
    {"url": "http://localhost:7432/other", "personas": ["first_timer"]},
    {"url": "https://user@evil.com/x", "personas": ["first_timer"]},
    {"url": "ftp://a.io/g", "personas": ["first_timer"]},
    {"url": "https://a.io/g x", "personas": ["first_timer"]},
    {"url": "https://a.io/g", "personas": []},
    {"url": "https://a.io/g", "personas": ["first_timer", "first_timer"]},
    {"url": "https://a.io/g", "personas": ["custom"], "custom": "  "},
    {"url": "https://a.io/g", "personas": ["custom"], "custom": "x" * 301},
    {"url": "https://a.io/g", "personas": ["speedrunner"]},
])
def test_run_validation(client, mock_db, project, body):
    assert client.post(f"{BASE}/agent-runs", json=body).status_code == 422
    mock_db.agent_runs.insert_one.assert_not_called()


# ─── Steps ───────────────────────────────────────────────────────────────────

def test_click_is_scaled_to_viewport_and_frame_stored(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    llm.return_value = make_llm_response(json.dumps(
        {"action": "click", "x": 512, "y": 288, "note": "I see a Start button", "stopReason": ""}))
    resp = client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step())
    assert resp.status_code == 200
    assert resp.json() == {"action": "click", "x": 640, "y": 360, "key": None, "note": "I see a Start button", "stopReason": None}

    user_msg = llm.call_args.kwargs["messages"][1]["content"]
    assert user_msg[1] == {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{JPEG}"}}
    assert "1024x576" in user_msg[0]["text"]

    claim_filter, claim_update = mock_db.agent_runs.update_one.call_args_list[0].args
    assert claim_update == {"$set": {"steps_used.first_timer": 1}}
    frame = mock_db.playtest_frames.insert_one.call_args[0][0]
    assert frame["report_or_run_id"] == str(RUN_ID) and frame["n"] == 1 and frame["jpeg"] == JPEG
    assert frame["action"] == "click" and frame["note"] == "I see a Start button"


@pytest.mark.parametrize("answer, expected", [
    ({"action": "click", "x": 5000, "y": -20, "note": "edge"}, {"action": "click", "x": 1279, "y": 0}),
    ({"action": "key", "key": "Space", "note": "jump"}, {"action": "key", "key": "Space"}),
    ({"action": "wait", "note": "loading"}, {"action": "wait"}),
    ({"action": "stop", "note": "bored", "stopReason": "Nothing happens"}, {"action": "stop", "stopReason": "Nothing happens"}),
])
def test_action_parsing(client, mock_db, project, llm, answer, expected):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    llm.return_value = make_llm_response("```json\n" + json.dumps(answer) + "\n```")
    body = client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step()).json()
    assert {k: body[k] for k in expected} == expected


@pytest.mark.parametrize("bad", ["not json at all", json.dumps({"action": "key", "key": "F12"}),
                                 json.dumps({"action": "click", "x": "left"}), json.dumps({"action": "dance"})])
def test_unreadable_answer_waits_once_then_stops(client, mock_db, project, llm, bad):
    llm.return_value = make_llm_response(bad)
    mock_db.agent_runs.find_one.return_value = _run_doc()
    first = client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step()).json()
    assert first["action"] == "wait" and first["note"] == "(couldn't read the screen this step)"
    assert {"$inc": {"bad_reads.first_timer": 1}} in [c.args[1] for c in mock_db.agent_runs.update_one.call_args_list]

    mock_db.agent_runs.find_one.return_value = _run_doc(steps_used={"first_timer": 1}, bad_reads={"first_timer": 1})
    second = client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step(n=2)).json()
    assert second["action"] == "stop" and second["stopReason"]


@pytest.mark.parametrize("run, step, code", [
    ({}, {"agent": "poker"}, 400),                                   # agent not in run
    ({"finished": ["first_timer"]}, {}, 400),                        # agent already reported
    ({}, {"n": 16}, 400),                                            # over the trial cap
    ({"steps_used": {"first_timer": 3}}, {"n": 3}, 409),             # replayed step
    ({"steps_used": {"first_timer": 3}}, {"n": 2}, 409),
])
def test_step_rejections(client, mock_db, project, llm, run, step, code):
    mock_db.agent_runs.find_one.return_value = _run_doc(**run)
    assert client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step(**step)).status_code == code
    llm.assert_not_called()


def test_step_lost_the_atomic_claim(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    mock_db.agent_runs.update_one.return_value = MagicMock(matched_count=0)
    assert client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step()).status_code == 409
    llm.assert_not_called()


@pytest.mark.parametrize("step", [
    {"jpegBase64": base64.b64encode(b"\x89PNG\r\n" + b"0" * 50).decode()},     # not a JPEG
    {"jpegBase64": base64.b64encode(b"\xff\xd8\xff" + b"0" * (400 * 1024)).decode()},  # > 400 KB
    {"jpegBase64": "!!!not-base64!!!"},
    {"n": 0}, {"n": 61}, {"agent": "hardcore"}, {"screenWidth": 0},
])
def test_step_body_validation(client, mock_db, project, llm, step):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    assert client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step(**step)).status_code == 422
    llm.assert_not_called()


def test_unknown_run_is_404(client, mock_db, project, llm):
    assert client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step()).status_code == 404
    assert mock_db.agent_runs.find_one.call_args[0][0]["user_id"] == TEST_USER_ID


def test_failed_llm_call_gives_the_step_back(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    llm.side_effect = RuntimeError("provider down")
    resp = client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step(n=4))
    assert resp.status_code == 502
    assert mock_db.agent_runs.update_one.call_args.args[1] == {"$set": {"steps_used.first_timer": 3}}
    mock_db.playtest_frames.insert_one.assert_not_called()


def test_step_sends_the_last_six_notes(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc(steps_used={"first_timer": 7})
    mock_db.playtest_frames.find.return_value = make_cursor([{"n": n, "note": f"note {n}"} for n in range(7, 1, -1)])
    llm.return_value = make_llm_response(json.dumps({"action": "wait", "note": "hm"}))
    client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step(n=8))
    text = llm.call_args.kwargs["messages"][1]["content"][0]["text"]
    assert text.index("note 2") < text.index("note 7")
    assert mock_db.playtest_frames.find.call_args[0][1] == {"jpeg": 0}


# ─── Finish + frames ─────────────────────────────────────────────────────────

REPORT_JSON = {
    "felt": "Lost but curious", "summary": "Clicked start, got stuck.", "confusions": ["No tutorial"],
    "bugs": ["Button did nothing"], "choices": ["Picked the left door"], "funHighlights": ["The music"],
    "softlocks": [], "pacingIssues": "not a list", "wouldKeepPlaying": False,
}


def test_finish_files_an_agent_play_report(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    mock_db.playtest_frames.find.return_value = make_cursor([
        {"n": 1, "action": "click", "note": "Start"}, {"n": 2, "action": "stop", "note": "Stuck", "stop_reason": "Nothing to do"},
    ])
    llm.return_value = make_llm_response(json.dumps(REPORT_JSON))
    report_id = ObjectId()
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=report_id)
    mock_db.playtests.find_one.side_effect = lambda q: {**stored(), "_id": report_id}

    def stored():
        return mock_db.playtests.insert_one.call_args[0][0]

    resp = client.post(f"{BASE}/agent-runs/{RUN_ID}/agents/first_timer/finish")
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "agent_play" and body["agentPersona"] == "first_timer"
    assert body["gameUrl"] == "https://mihir.itch.io/ripple"
    assert body["steps"] == [{"n": 1, "action": "click", "note": "Start"}, {"n": 2, "action": "stop", "note": "Stuck"}]
    assert body["stopReason"] == "Nothing to do"
    assert body["felt"] == "Lost but curious" and body["confusions"] == ["No tutorial"]
    assert body["bugs"] == ["Button did nothing"] and body["choices"] == ["Picked the left door"]
    assert body["funHighlights"] == ["The music"] and body["pacingIssues"] == []
    assert body["wouldKeepPlaying"] is False and body["persona"] is None
    assert stored()["kind"] == "agent_play" and "testers" not in stored()
    rekey_filter, rekey = mock_db.playtest_frames.update_many.call_args.args
    assert rekey_filter == {"report_or_run_id": str(RUN_ID), "agent": "first_timer"}
    assert rekey == {"$set": {"report_or_run_id": str(report_id)}}


def test_finish_uses_the_web_stop_reason(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    mock_db.playtest_frames.find.return_value = make_cursor([{"n": 1, "action": "wait", "note": "Loading"}])
    llm.return_value = make_llm_response(json.dumps(REPORT_JSON))
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=ObjectId())
    mock_db.playtests.find_one.side_effect = lambda q: {**mock_db.playtests.insert_one.call_args[0][0], "_id": ObjectId()}
    resp = client.post(f"{BASE}/agent-runs/{RUN_ID}/agents/first_timer/finish", json={"stopReason": "The game navigated away"})
    assert resp.json()["stopReason"] == "The game navigated away"
    assert "The game navigated away" in llm.call_args.kwargs["messages"][1]["content"]


@pytest.mark.parametrize("run, frames, code", [
    ({}, [], 409),                                       # no steps yet
    ({"agents": ["poker"]}, [{"n": 1}], 400),           # agent not in run
])
def test_finish_rejections(client, mock_db, project, llm, run, frames, code):
    mock_db.agent_runs.find_one.return_value = _run_doc(**run)
    mock_db.playtest_frames.find.return_value = make_cursor(frames)
    assert client.post(f"{BASE}/agent-runs/{RUN_ID}/agents/first_timer/finish").status_code == code
    llm.assert_not_called()
    mock_db.playtests.insert_one.assert_not_called()


def test_finish_twice_is_409(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    mock_db.agent_runs.update_one.return_value = MagicMock(matched_count=0)
    assert client.post(f"{BASE}/agent-runs/{RUN_ID}/agents/first_timer/finish").status_code == 409
    llm.assert_not_called()


def test_frames_for_a_report(client, mock_db, project):
    report_id = ObjectId()
    mock_db.playtests.find_one.return_value = {"_id": report_id, "project_id": TEST_PROJECT_ID}
    mock_db.playtest_frames.find.return_value = make_cursor([{"n": 1, "jpeg": JPEG}, {"n": 2, "jpeg": JPEG}])
    resp = client.get(f"{BASE}/{report_id}/frames")
    assert resp.status_code == 200
    assert resp.json() == [{"n": 1, "jpegBase64": JPEG}, {"n": 2, "jpegBase64": JPEG}]
    assert mock_db.playtest_frames.find.call_args[0][0] == {"report_or_run_id": str(report_id)}


def test_frames_of_another_projects_report_are_404(client, mock_db, project):
    assert client.get(f"{BASE}/{ObjectId()}/frames").status_code == 404
    mock_db.playtest_frames.find.assert_not_called()


def test_deleting_a_report_deletes_its_frames(client, mock_db, project):
    report_id = str(ObjectId())
    assert client.delete(f"{BASE}/{report_id}").status_code == 204
    mock_db.playtest_frames.delete_many.assert_awaited_once_with({"report_or_run_id": report_id})


# ─── No project data in agent prompts ────────────────────────────────────────

def test_prompts_never_contain_project_data(client, mock_db, project, llm):
    mock_db.agent_runs.find_one.return_value = _run_doc()
    llm.return_value = make_llm_response(json.dumps({"action": "wait", "note": "hm"}))
    client.post(f"{BASE}/agent-runs/{RUN_ID}/steps", json=_step())
    mock_db.playtest_frames.find.return_value = make_cursor([{"n": 1, "action": "wait", "note": "hm"}])
    llm.return_value = make_llm_response(json.dumps(REPORT_JSON))
    mock_db.playtests.insert_one.return_value = MagicMock(inserted_id=ObjectId())
    mock_db.playtests.find_one.side_effect = lambda q: {**mock_db.playtests.insert_one.call_args[0][0], "_id": ObjectId()}
    client.post(f"{BASE}/agent-runs/{RUN_ID}/agents/first_timer/finish")

    assert llm.call_count == 2
    sent = json.dumps([c.kwargs["messages"] for c in llm.call_args_list])
    for secret in SECRETS:
        assert secret not in sent
    mock_db.gdds.find_one.assert_not_called()


# ─── Gates ignore agent_play reports ─────────────────────────────────────────

def test_agent_play_reports_never_count_toward_gates(client, mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "prototype", "prototype_decision": "continue"}
    playtests: list[dict] = []
    mock_db.playtests.find = MagicMock(side_effect=lambda q: make_cursor(
        [d for d in playtests if all(d.get(k) == v for k, v in q.items())]))

    before = client.get(f"/projects/{TEST_PROJECT_ID}/gates").json()
    playtests.append({"project_id": TEST_PROJECT_ID, "kind": "agent_play", "agent_persona": "first_timer",
                      "testers": 5, "ring": "discord", "created_at": datetime.utcnow()})
    after = client.get(f"/projects/{TEST_PROJECT_ID}/gates").json()
    assert after == before
    assert "Log a playtest session with 3+ testers outside yourself" in after["missing"]


# ─── Estimate ────────────────────────────────────────────────────────────────

def test_estimate_prices_the_trial_model(client, mock_db, project):
    resp = client.get(f"{BASE}/agent-runs/estimate?agents=1&steps=15")
    assert resp.status_code == 200
    usd = resp.json()["usd"]
    assert isinstance(usd, float) and 0 < usd < 1


def test_estimate_scales_with_agents_and_steps(client, mock_db, project):
    one = client.get(f"{BASE}/agent-runs/estimate?agents=1&steps=15").json()["usd"]
    three = client.get(f"{BASE}/agent-runs/estimate?agents=3&steps=15").json()["usd"]
    assert three == pytest.approx(one * 3, rel=1e-3)


def test_estimate_is_null_when_the_model_cant_be_priced(client, mock_db, project):
    app.dependency_overrides[get_current_user] = lambda: _own_key_user("foo/bar")
    assert client.get(f"{BASE}/agent-runs/estimate?agents=1&steps=40").json() == {"usd": None}


@pytest.mark.parametrize("q", ["agents=0&steps=5", "agents=5&steps=5", "agents=1&steps=61", "agents=1"])
def test_estimate_validation(client, mock_db, project, q):
    assert client.get(f"{BASE}/agent-runs/estimate?{q}").status_code == 422


# ─── complete_vision ─────────────────────────────────────────────────────────

def _run(user, coro_fn):
    async def go():
        current_llm_user.set(user)
        return await coro_fn()
    return asyncio.run(go())


def test_complete_vision_on_trial_records_budget(mock_db, llm):
    llm.return_value = make_llm_response("seen")
    assert _run(None, lambda: complete_vision("sys", "look", JPEG, 50)) == "seen"
    kwargs = llm.call_args.kwargs
    assert kwargs["model"] == "anthropic/claude-haiku-4-5" and kwargs["max_tokens"] == 50
    assert kwargs["messages"][1]["content"][0] == {"type": "text", "text": "look"}
    mock_db.llm_budget.update_one.assert_awaited_once()


def test_complete_vision_rejects_non_vision_model(mock_db, llm, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "groq/llama-3.3-70b-versatile")
    with pytest.raises(ValueError, match="groq/llama-3.3-70b-versatile can't see images"):
        _run(None, lambda: complete_vision("sys", "look", JPEG))
    llm.assert_not_called()


def test_complete_vision_uses_own_key_unmetered(mock_db, llm, monkeypatch):
    monkeypatch.setattr(settings, "llm_key_secret", Fernet.generate_key().decode())
    llm.return_value = make_llm_response("seen")
    user = {**TEST_USER, "llm": {"provider": "openai", "model": "openai/gpt-4o", "key_encrypted": encrypt_key("sk-own-1234567890")}}
    assert _run(user, lambda: complete_vision("sys", "look", JPEG)) == "seen"
    assert llm.call_args.kwargs["api_key"] == "sk-own-1234567890"
    assert llm.call_args.kwargs["model"] == "openai/gpt-4o"
    mock_db.llm_budget.update_one.assert_not_called()
