"""
Integration tests for /projects/{id}/gdd/generate — interview mode + grounding.
LLM is mocked — no real network calls.
"""
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId

from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_llm_response

THIN_CONCEPT = {
    "title": "Untitled Game",
    "genre": "rpg",
    "platform": "pc",
    "tone": "epic",
}

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
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": THIN_CONCEPT}
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


def test_garbage_checker_output_still_generates(client, mock_db, monkeypatch):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT, "concept_card": THIN_CONCEPT}
    responses = [make_llm_response("not json at all")] + [
        make_llm_response(SECTION_TEXT) for _ in range(8)
    ]
    mock_llm = MagicMock(side_effect=responses)
    monkeypatch.setattr("litellm.completion", mock_llm)
    _prime_gdd_insert(mock_db)

    resp = client.post(f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={})
    assert resp.status_code == 201
    assert resp.json()["sections"]["mechanics"] == SECTION_TEXT
    assert mock_llm.call_count == 9  # 1 failed check + 8 sections
