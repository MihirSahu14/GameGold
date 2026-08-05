"""
Per-project LLM concurrency guard (A2). LLM calls are mocked — no real
network calls.
"""
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.core.concurrency import _locks, project_llm_slot
from app.models.systems import BalanceAnalysisOut
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID

CANNED = BalanceAnalysisOut()


def _prime(mock_db):
    mock_db.projects.find_one.return_value = {**TEST_PROJECT}
    mock_db.gdds.find_one.return_value = None
    mock_db.systems.find_one.return_value = None


def _slow_analyze(delay: float):
    async def _inner(*args, **kwargs):
        await asyncio.sleep(delay)
        return CANNED

    return _inner


def test_overlapping_requests_same_project_one_429_with_retry_after(client, mock_db, monkeypatch):
    _prime(mock_db)
    monkeypatch.setattr("app.routers.systems.analyze_balance", _slow_analyze(0.3))

    responses = []

    def call():
        responses.append(client.post(f"/projects/{TEST_PROJECT_ID}/systems/analyze", json={}))

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call)
        time.sleep(0.1)  # let the first request acquire the lock
        second = pool.submit(call)
        first.result()
        second.result()

    codes = sorted(r.status_code for r in responses)
    assert codes == [200, 429]
    rejected = next(r for r in responses if r.status_code == 429)
    assert "Retry-After" in rejected.headers


def test_concurrent_requests_different_projects_neither_429s(client, mock_db, monkeypatch):
    _prime(mock_db)
    monkeypatch.setattr("app.routers.systems.analyze_balance", _slow_analyze(0.2))

    other_project_id = "000000000000000000000001"
    responses = []

    def call(project_id):
        responses.append(client.post(f"/projects/{project_id}/systems/analyze", json={}))

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call, TEST_PROJECT_ID)
        time.sleep(0.05)
        second = pool.submit(call, other_project_id)
        first.result()
        second.result()

    assert [r.status_code for r in responses] == [200, 200]


async def test_lock_released_after_success():
    async with project_llm_slot("proj-success"):
        pass
    assert not _locks["proj-success"].locked()


async def test_lock_released_after_exception():
    with pytest.raises(ValueError):
        async with project_llm_slot("proj-fail"):
            raise ValueError("boom")
    assert not _locks["proj-fail"].locked()
