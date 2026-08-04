"""
Perf probe — measurement only, changes no behavior.

Times a handful of representative endpoints end-to-end using the same
TestClient + mocked-DB/mocked-LLM pattern as backend/tests/conftest.py
(reuses `make_cursor` and `make_llm_response` from there directly).
Starts nothing external: no real MongoDB, no real LiteLLM call.

Run from repo root: python backend/scripts/perf_probe.py
"""
import json
import os
import statistics
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB", "gamegold_test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-32-chars-long-ok")
os.environ.setdefault("LLM_API_KEY", "test-llm-key")
os.environ.setdefault("LLM_MODEL", "groq/llama-3.3-70b-versatile")

from datetime import datetime

from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.routers.auth import get_current_user
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, TEST_USER, make_cursor, make_llm_response

REPEATS = 20

CONCEPT_CARD = {"title": "Test Game", "genre": "rpg", "platform": "pc", "tone": "epic"}
SUFFICIENT_JSON = json.dumps({"sufficient": True, "questions": []})
SECTION_TEXT = "## Section\n\nGrounded design content."


def build_mock_db():
    db = MagicMock()
    db.projects = MagicMock()
    now = datetime.utcnow()
    project_doc = {**TEST_PROJECT, "concept_card": CONCEPT_CARD, "created_at": now, "updated_at": now}
    db.projects.find_one = AsyncMock(return_value=project_doc)
    db.projects.find = MagicMock(return_value=make_cursor([project_doc]))
    db.projects.update_one = AsyncMock()

    gdd_doc = {
        "_id": ObjectId(),
        "project_id": TEST_PROJECT_ID,
        "sections": {"overview": SECTION_TEXT},
        "version": 1,
        "updated_at": now,
    }
    db.gdds = MagicMock()
    db.gdds.find_one = AsyncMock(side_effect=lambda *a, **k: gdd_doc)
    db.gdds.insert_one = AsyncMock(return_value=MagicMock(inserted_id=gdd_doc["_id"]))
    db.gdds.update_one = AsyncMock()

    db.assets = MagicMock()
    db.assets.find = MagicMock(return_value=make_cursor([]))

    return db


def build_client():
    db = build_mock_db()
    stack_patches = [
        patch("app.routers.projects.get_db", lambda: db),
        patch("app.routers.gdd.get_db", lambda: db),
        patch("app.routers.assets.get_db", lambda: db),
        patch("app.main.connect_db", AsyncMock()),
        patch("app.main.close_db", AsyncMock()),
        patch("litellm.completion", MagicMock(return_value=make_llm_response(SECTION_TEXT))),
    ]
    for p in stack_patches:
        p.start()

    app.dependency_overrides[get_current_user] = lambda: TEST_USER
    client = TestClient(app)
    client.__enter__()
    return client, stack_patches


def main():
    client, patches = build_client()
    try:
        import time

        endpoints = {
            "GET /health": lambda: client.get("/health"),
            "GET /projects": lambda: client.get("/projects"),
            "GET /projects/{id}/assets": lambda: client.get(f"/projects/{TEST_PROJECT_ID}/assets"),
            "POST /projects/{id}/gdd/generate": lambda: client.post(
                f"/projects/{TEST_PROJECT_ID}/gdd/generate", json={"answers": {}}
            ),
        }

        rows = []
        for name, call in endpoints.items():
            durations_ms = []
            for _ in range(REPEATS):
                start = time.perf_counter()
                resp = call()
                elapsed_ms = (time.perf_counter() - start) * 1000
                assert resp.status_code < 500, f"{name} failed: {resp.status_code} {resp.text}"
                durations_ms.append(elapsed_ms)
            rows.append((name, statistics.median(durations_ms)))

        print("| endpoint | median ms | notes |")
        print("|---|---|---|")
        for name, median_ms in rows:
            note = "mocked DB + mocked LLM, no network" if "gdd" in name else "mocked DB, no network"
            print(f"| {name} | {median_ms:.2f} | {note} |")
    finally:
        client.__exit__(None, None, None)
        for p in patches:
            p.stop()
        app.dependency_overrides.clear()


if __name__ == "__main__":
    main()
