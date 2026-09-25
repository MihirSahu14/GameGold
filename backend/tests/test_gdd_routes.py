"""
Integration tests for /projects/{id}/gdd/generate — interview mode + grounding.
LLM is mocked — no real network calls.
"""
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from app.prompts.gdd_prompt import DEFAULT_CLARIFYING_QUESTIONS, GAME_DESIGN_SYSTEM_PROMPT, SECTION_INSTRUCTIONS
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor, make_llm_response

THIN_CONCEPT = {
    "title": "Untitled Game",
    "genre": "rpg",
    "platform": "pc",
    "tone": "epic",
}

# Has a core loop, so the deterministic pre-check passes and the LLM check runs.
VAGUE_CONCEPT = {**THIN_CONCEPT, "core_loop": "fight stuff"}

INSUFFICIENT_JSON = json.dumps(
    {
        "sufficient": False,
        "questions": [
            "What is the core gameplay loop, minute to minute?",
            "What makes this RPG different from others in the genre?",
        ],
    }
)

SECTION_TEXT = "## Section\n\nGrounded design content."

GDD_SECTION_KEYS = ["overview", "mechanics", "progression", "levels", "characters", "ui", "audio", "visual"]


def _fake_gdd_doc() -> dict:
    return {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "sections": {key: SECTION_TEXT for key in GDD_SECTION_KEYS},
        "version": 1,
        "updated_at": datetime.utcnow(),
    }


def _prime_gdd_insert(mock_db):
    """No existing GDD → insert → re-fetch inserted doc."""
    doc = _fake_gdd_doc()
    mock_db.gdds.find_one = AsyncMock(side_effect=[None, doc])
    mock_db.gdds.insert_one = AsyncMock(return_value=MagicMock(inserted_id=doc["_id"]))
    return doc


# ─── Interview mode ───────────────────────────────────────────────────────────

def test_thin_concept_without_answers_returns_needs_info(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": VAGUE_CONCEPT}
    mock_llm = MagicMock(return_value=make_llm_response(INSUFFICIENT_JSON))
    monkeypatch.setattr("litellm.completion", mock_llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["needsInfo"] is True
    assert body["questions"] == [
        "What is the core gameplay loop, minute to minute?",
        "What makes this RPG different from others in the genre?",
    ]
    # Only the sufficiency check ran — no GDD sections were generated.
    assert mock_llm.call_count == 1


def test_answers_skip_check_and_reach_section_prompts(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": THIN_CONCEPT}
    mock_llm = MagicMock(return_value=make_llm_response(SECTION_TEXT))
    monkeypatch.setattr("litellm.completion", mock_llm)
    _prime_gdd_insert(mock_db)

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/gdd/generate",
        json={"answers": {"What is the core loop?": "Wall-jump only movement with dash combos"}},
    )
    assert resp.status_code == 201
    assert resp.json()["sections"]["overview"] == SECTION_TEXT

    # Check skipped: exactly 8 section calls, no sufficiency call.
    assert mock_llm.call_count == 8
    prompts = str(mock_llm.call_args_list)
    assert "DEVELOPER ANSWERS" in prompts
    assert "Wall-jump only movement with dash combos" in prompts


def test_garbage_checker_output_fails_closed_with_default_questions(client, mock_db, monkeypatch):
    # Spec change (audit 2026-09-25): a broken check must not silently generate
    # a GDD from a thin card — it returns the default question set instead.
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": VAGUE_CONCEPT}
    mock_llm = MagicMock(return_value=make_llm_response("not json at all"))
    monkeypatch.setattr("litellm.completion", mock_llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={})
    assert resp.status_code == 200
    assert resp.json()["needsInfo"] is True
    assert resp.json()["questions"] == DEFAULT_CLARIFYING_QUESTIONS
    assert mock_llm.call_count == 1  # the failed check only — no sections


def test_no_core_loop_or_hook_returns_fixed_questions_without_llm(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": THIN_CONCEPT}
    mock_llm = MagicMock()
    monkeypatch.setattr("litellm.completion", mock_llm)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={})
    assert resp.status_code == 200
    assert resp.json() == {"needsInfo": True, "questions": DEFAULT_CLARIFYING_QUESTIONS}
    mock_llm.assert_not_called()


def test_camelcase_hook_from_frontend_passes_precheck(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_llm = MagicMock(return_value=make_llm_response(INSUFFICIENT_JSON))
    monkeypatch.setattr("litellm.completion", mock_llm)

    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/gdd/generate",
        json={"conceptCard": {**THIN_CONCEPT, "uniqueHook": "Time rewinds on death"}},
    )
    assert resp.status_code == 200
    assert mock_llm.call_count == 1  # reached the LLM check


def test_generate_gdd_502_when_llm_provider_errors(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": VAGUE_CONCEPT}
    monkeypatch.setattr("litellm.completion", MagicMock(side_effect=RuntimeError("rate limited")))
    _prime_gdd_insert(mock_db)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={"answers": {}})
    assert resp.status_code == 502
    assert "LLM call failed" in resp.json()["detail"]


def test_generate_gdd_never_regresses_stage(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "stage": "assets"}
    monkeypatch.setattr("litellm.completion", MagicMock(return_value=make_llm_response(SECTION_TEXT)))
    _prime_gdd_insert(mock_db)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={"answers": {}})
    assert resp.status_code == 201
    mock_db.projects.update_one.assert_not_called()


# ─── Refine ───────────────────────────────────────────────────────────────────

def test_refine_rejects_unknown_section(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/gdd/refine",
        json={"section": "marketing", "currentContent": "x", "instructions": "y"},
    )
    assert resp.status_code == 422


def test_refine_rejects_oversized_content(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/gdd/refine",
        json={"section": "overview", "currentContent": "x" * 20001, "instructions": "y"},
    )
    assert resp.status_code == 422


def test_refine_returns_llm_content(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_llm = MagicMock(return_value=make_llm_response("## Refined"))
    monkeypatch.setattr("litellm.completion", mock_llm)
    resp = client.post(
        f"/projects/{TEST_PROJECT_ID}/gdd/refine",
        json={"section": "overview", "currentContent": "old", "instructions": "punchier"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"section": "overview", "content": "## Refined"}
    assert "punchier" in str(mock_llm.call_args)


# ─── Compile from decisions (spec 2026-09-25) ────────────────────────────────

def test_gdd_prompt_compiles_instead_of_inventing():
    assert "do not invent" in GAME_DESIGN_SYSTEM_PROMPT.lower()
    assert "3-4 design pillars" not in SECTION_INSTRUCTIONS["overview"]
    assert "pillars" in SECTION_INSTRUCTIONS["overview"]


def test_generate_gdd_compiles_from_pillars_and_session_notes(client, mock_db, monkeypatch):
    card = {**THIN_CONCEPT, "pillars": ["Tense", "Readable", "Short runs"]}
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": card}
    mock_db.playtests.find.return_value = make_cursor(
        [{"kind": "session", "testers": 4, "ring": "friends", "notes": "Nobody found the dash button"}]
    )
    mock_llm = MagicMock(return_value=make_llm_response(SECTION_TEXT))
    monkeypatch.setattr("litellm.completion", mock_llm)
    _prime_gdd_insert(mock_db)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={"answers": {}})
    assert resp.status_code == 201
    prompts = str(mock_llm.call_args_list)
    assert "PLAYTEST NOTES" in prompts
    assert "Nobody found the dash button" in prompts
    assert "Tense; Readable; Short runs" in prompts
    mock_db.playtests.find.assert_called_with({"project_id": TEST_PROJECT_ID, "kind": "session"})
