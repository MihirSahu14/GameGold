"""
Tests for balance_service.py — LLM is mocked; no real network calls.
"""
import json
import pytest
from unittest.mock import MagicMock

from tests.conftest import CANNED_BALANCE_JSON, CANNED_BALANCE_TEXT


def _make_litellm_response(text: str) -> MagicMock:
    msg = MagicMock()
    msg.content = text
    choice = MagicMock()
    choice.message = msg
    response = MagicMock()
    response.choices = [choice]
    return response


async def test_analyze_returns_balance_analysis(monkeypatch):
    """Service parses valid JSON from LLM into BalanceAnalysisOut."""
    from app.models.systems import SystemNodeIn, SystemEdgeIn

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

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
    mock_completion = MagicMock(return_value=_make_litellm_response(empty_response))
    monkeypatch.setattr("litellm.completion", mock_completion)

    from app.services.balance_service import analyze_balance

    result = await analyze_balance([], [], gdd_summary="")

    assert result.exploits == []
    assert result.power_creep == []
    assert result.dominant_strategies == []
    assert result.suggestions == []


async def test_analyze_prompt_includes_node_labels(monkeypatch):
    """LLM is called with a prompt that contains the node labels."""
    from app.models.systems import SystemNodeIn, SystemEdgeIn

    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    from app.services.balance_service import analyze_balance

    nodes = [
        SystemNodeIn(id="n1", type="entity", label="PlayerHero"),
        SystemNodeIn(id="n2", type="entity", label="DarkBoss"),
    ]
    await analyze_balance(nodes, [], gdd_summary="")

    prompt_text = str(mock_completion.call_args)
    assert "PlayerHero" in prompt_text
    assert "DarkBoss" in prompt_text


async def test_analyze_raises_on_invalid_json(monkeypatch):
    """Service raises ValueError when LLM returns non-JSON text."""
    mock_completion = MagicMock(return_value=_make_litellm_response("This is not JSON at all"))
    monkeypatch.setattr("litellm.completion", mock_completion)

    from app.services.balance_service import analyze_balance

    with pytest.raises(ValueError, match="invalid"):
        await analyze_balance([], [], gdd_summary="")


async def test_analyze_passes_gdd_summary_to_prompt(monkeypatch):
    """GDD summary is included in the LLM prompt for context."""
    mock_completion = MagicMock(return_value=_make_litellm_response(CANNED_BALANCE_TEXT))
    monkeypatch.setattr("litellm.completion", mock_completion)

    from app.services.balance_service import analyze_balance

    await analyze_balance([], [], gdd_summary="Fantasy RPG with turn-based combat")

    prompt_text = str(mock_completion.call_args)
    assert "Fantasy RPG" in prompt_text
