"""Pitch interview: asks questions, offers labeled options, names comparables — never writes the pitch."""
import json
from unittest.mock import MagicMock

from app.prompts.gdd_prompt import PITCH_INTERVIEW_PROMPT, format_concept_card
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_llm_response

CARD = {
    "title": "Test Game", "genre": "rpg", "platform": "pc", "unique_hook": "Bees rewind time",
    "pillars": ["Tense", "Readable"], "wont_do": [],
}


def test_format_concept_card_joins_lists_and_skips_empty_ones():
    text = format_concept_card(CARD)
    assert "- pillars: Tense; Readable" in text
    assert "wont_do" not in text


def test_interview_prompt_forbids_writing_the_pitch():
    assert "NEVER write the hook, the pillars, or the won't-do list" in PITCH_INTERVIEW_PROMPT


def test_interview_returns_capped_questions_options_comparables(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    payload = {
        "questions": [f"q{i}" for i in range(8)],
        "options": ["Option A: a", "Option B: b", "Option C: c", "Option D: d"],
        "comparables": ["Braid — time rewind", ""],
    }
    llm = MagicMock(return_value=make_llm_response(json.dumps(payload)))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/pitch/interview")
    assert resp.status_code == 200
    assert resp.json() == {
        "questions": ["q0", "q1", "q2", "q3", "q4"],
        "options": ["Option A: a", "Option B: b", "Option C: c"],
        "comparables": ["Braid — time rewind"],
    }
    system, user = (m["content"] for m in llm.call_args.kwargs["messages"])
    assert system == PITCH_INTERVIEW_PROMPT
    assert "Tense; Readable" in user


def test_interview_prompt_names_missing_gate_items(monkeypatch):
    from app.prompts.gdd_prompt import build_pitch_interview_prompt

    prompt = build_pitch_interview_prompt(CARD, ["Name exactly 3 pillars", "Pick a genre"])
    assert "The pitch is still missing: Name exactly 3 pillars; Pick a genre" in prompt
    assert "make at least one question target these" in prompt


def test_interview_prompt_omits_missing_note_when_gate_is_met():
    from app.prompts.gdd_prompt import build_pitch_interview_prompt

    prompt = build_pitch_interview_prompt(CARD, [])
    assert "still missing" not in prompt


def test_interview_route_passes_gate_missing_items_into_the_prompt(client, mock_db, monkeypatch):
    # Thin card -> pitch gate fails on pillars/hook/wont_do/genre.
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": {}}
    payload = {"questions": ["q"], "options": [], "comparables": []}
    llm = MagicMock(return_value=make_llm_response(json.dumps(payload)))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/pitch/interview")
    assert resp.status_code == 200
    user_prompt = llm.call_args.kwargs["messages"][1]["content"]
    assert "still missing" in user_prompt
    assert "Write your hook" in user_prompt


def test_interview_502_on_garbage_output(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": CARD}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response("nope")))
    resp = client.post(f"/projects/{TEST_PROJECT_ID}/pitch/interview")
    assert resp.status_code == 502


def test_gdd_sufficiency_check_uses_the_interview_prompt(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": {**CARD, "core_loop": "dash"}}
    llm = MagicMock(return_value=make_llm_response(json.dumps(
        {"questions": ["What happens on death?"], "options": [], "comparables": []}
    )))
    monkeypatch.setattr("litellm.completion", llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={})
    assert resp.json() == {"needsInfo": True, "questions": ["What happens on death?"]}
    assert llm.call_args.kwargs["messages"][0]["content"] == PITCH_INTERVIEW_PROMPT
