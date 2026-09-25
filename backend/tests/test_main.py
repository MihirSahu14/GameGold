"""Startup wiring: the stage migration runs once at boot and never blocks it."""
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app


def test_lifespan_runs_stage_migration_after_connect(monkeypatch):
    migrate = AsyncMock(return_value={"projects": 0, "assets": 0})
    monkeypatch.setattr("app.main.connect_db", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())
    monkeypatch.setattr("app.main.migrate_stages", migrate)

    with TestClient(app):
        pass

    migrate.assert_awaited_once()


def test_lifespan_does_not_block_startup_when_migration_fails(monkeypatch):
    monkeypatch.setattr("app.main.connect_db", AsyncMock())
    monkeypatch.setattr("app.main.close_db", AsyncMock())
    monkeypatch.setattr("app.main.migrate_stages", AsyncMock(side_effect=RuntimeError("boom")))

    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
