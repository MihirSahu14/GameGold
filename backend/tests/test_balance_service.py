"""
Tests for balance_service.py — Claude API is mocked; no real network calls.
All tests here fail until backend/app/services/balance_service.py is implemented.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import CANNED_BALANCE_JSON, CANNED_BALANCE_TEXT


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_claude_response(text: str) -> MagicMock:
    content_block = MagicMock()
    content_block.text = text
    response = MagicMock()
    response.content = [content_block]
    return response


# ─── Tests ────────────────────────────────────────────────────────────────────

async def test_analyze_returns_balance_analysis(monkeypatch):
    """Service parses valid JSON from Claude into BalanceAnalysisOut."""
    from app.models.systems import SystemNodeIn, SystemEdgeIn

    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_claude_response(CANNED_BALANCE_TEXT)
    monkeypatch.setattr("app.services.balance_service.client", mock_client)

    from app.services.balance_service import analyze_balance

    nodes = [SystemNodeIn(id="n1", type="entity", label="Player")]
    edges = [SystemEdgeIn(id="e1", source="n1", target="n2")]
    result = await analyze_balance(nodes, edges, gdd_summary="A fantasy RPG")

    assert result.exploits == CANNED_BALANCE_JSON["exploits"]
    assert result.power_creep == CANNED_BALANCE_JSON["powerCreep"]
    assert result.dominant_strategies == CANNED_BALANCE_JSON["dominantStrategies"]
    assert result.suggestions == CANNED_BALANCE_JSON["suggestions"]


async def test_analyze_handles_empty_graph(monkeypatch):
    """Empty nodes and edges list does not crash; returns empty analysis."""
    empty_response = json.dumps(
        {"exploits": [], "powerCreep": [], "dominantStrategies": [], "suggestions": []}
    )
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_claude_response(empty_response)
    monkeypatch.setattr("app.services.balance_service.client", mock_client)

    from app.services.balance_service import analyze_balance

    result = await analyze_balance([], [], gdd_summary="")

    assert result.exploits == []
    assert result.power_creep == []
    assert result.dominant_strategies == []
    assert result.suggestions == []


async def test_analyze_prompt_includes_node_labels(monkeypatch):
    """Claude is called with a prompt that contains the node labels."""
    from app.models.systems import SystemNodeIn, SystemEdgeIn

    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_claude_response(CANNED_BALANCE_TEXT)
    monkeypatch.setattr("app.services.balance_service.client", mock_client)

    from app.services.balance_service import analyze_balance

    nodes = [
        SystemNodeIn(id="n1", type="entity", label="PlayerHero"),
        SystemNodeIn(id="n2", type="entity", label="DarkBoss"),
    ]
    await analyze_balance(nodes, [], gdd_summary="")

    call_kwargs = mock_client.messages.create.call_args
    prompt_text = str(call_kwargs)
    assert "PlayerHero" in prompt_text
    assert "DarkBoss" in prompt_text


async def test_analyze_raises_on_invalid_json(monkeypatch):
    """Service raises ValueError when Claude returns non-JSON text."""
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_claude_response("This is not JSON at all")
    monkeypatch.setattr("app.services.balance_service.client", mock_client)

    from app.services.balance_service import analyze_balance

    with pytest.raises(ValueError, match="invalid"):
        await analyze_balance([], [], gdd_summary="")


async def test_analyze_passes_gdd_summary_to_prompt(monkeypatch):
    """GDD summary is included in the Claude prompt for context."""
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _make_claude_response(CANNED_BALANCE_TEXT)
    monkeypatch.setattr("app.services.balance_service.client", mock_client)

    from app.services.balance_service import analyze_balance

    await analyze_balance([], [], gdd_summary="Fantasy RPG with turn-based combat")

    call_kwargs = mock_client.messages.create.call_args
    prompt_text = str(call_kwargs)
    assert "Fantasy RPG" in prompt_text
