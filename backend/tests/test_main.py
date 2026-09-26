"""Startup wiring: the stage migration runs once at boot and never blocks it."""
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app


def test_lifespan_runs_stage_migration_after_connect(monkeypatch):
    migrate = AsyncMock(return_value={"projects": 0, "assets": 0})
    monkeypatch.setattr("app.main.connect_db", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())
    monkeypatch.setattr("app.main.migrate_stages", migrate)
    emails = AsyncMock(return_value={})
    monkeypatch.setattr("app.main.migrate_emails", emails)

    with TestClient(app):
        pass

    migrate.assert_awaited_once()
    emails.assert_awaited_once()


def test_lifespan_does_not_block_startup_when_migration_fails(monkeypatch):
    monkeypatch.setattr("app.main.connect_db", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())
    monkeypatch.setattr("app.main.migrate_stages", AsyncMock(side_effect=RuntimeError("boom")))
    monkeypatch.setattr("app.main.migrate_emails", AsyncMock(side_effect=RuntimeError("boom")))

    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200


# ─── GET /health/llm (#7) ────────────────────────────────────────────────────
from unittest.mock import MagicMock

from tests.conftest import make_llm_response


def test_llm_health_ok_makes_one_tiny_call(client, monkeypatch):
    llm = MagicMock(return_value=make_llm_response("ok"))
    monkeypatch.setattr("litellm.completion", llm)
    resp = client.get("/health/llm")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True and body["model"] == "groq/llama-3.3-70b-versatile"
    assert isinstance(body["latency_ms"], int)
    assert llm.call_args.kwargs["max_tokens"] == 5
    assert llm.call_args.kwargs["messages"][0]["role"] == "system"


def test_llm_health_503_names_the_error_class(client, monkeypatch):
    class NotFoundError(Exception):
        pass

    monkeypatch.setattr("litellm.completion", MagicMock(side_effect=NotFoundError("model retired")))
    resp = client.get("/health/llm")
    assert resp.status_code == 503
    assert resp.json()["detail"]["error"] == "NotFoundError"
    assert resp.json()["detail"]["ok"] is False


def test_llm_health_requires_auth(auth_client):
    assert auth_client.get("/health/llm").status_code == 401
