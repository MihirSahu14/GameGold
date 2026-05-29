"""
Tests for systems Pydantic models.
All tests here fail until backend/app/models/systems.py is implemented.
"""
import pytest
from datetime import datetime
from bson import ObjectId
from pydantic import ValidationError


def test_system_node_in_accepts_valid_types():
    from app.models.systems import SystemNodeIn

    for node_type in ("entity", "mechanic", "event", "state"):
        node = SystemNodeIn(
            id="n1",
            type=node_type,
            label="Test",
            data={},
            position={"x": 0, "y": 0},
        )
        assert node.type == node_type


def test_system_node_in_rejects_unknown_type():
    from app.models.systems import SystemNodeIn

    with pytest.raises(ValidationError):
        SystemNodeIn(id="n1", type="INVALID", label="Test", data={}, position={"x": 0, "y": 0})


def test_system_node_in_defaults():
    from app.models.systems import SystemNodeIn

    node = SystemNodeIn(id="n1", type="entity", label="Player")
    assert node.data == {}
    assert node.position == {"x": 0, "y": 0}


def test_system_edge_in_label_optional():
    from app.models.systems import SystemEdgeIn

    edge = SystemEdgeIn(id="e1", source="n1", target="n2")
    assert edge.label is None

    edge_with_label = SystemEdgeIn(id="e2", source="n1", target="n2", label="drops")
    assert edge_with_label.label == "drops"


def test_game_system_in_db_sets_updated_at_default():
    from app.models.systems import GameSystemInDB

    before = datetime.utcnow()
    system = GameSystemInDB(project_id="proj123")
    after = datetime.utcnow()

    assert before <= system.updated_at <= after
    assert system.nodes == []
    assert system.edges == []
    assert system.analysis_cache is None


def test_game_system_out_serializes_id_as_string():
    from app.models.systems import GameSystemOut

    oid = ObjectId()
    system = GameSystemOut(
        **{
            "_id": str(oid),
            "project_id": "proj123",
            "nodes": [],
            "edges": [],
            "updated_at": datetime.utcnow(),
        }
    )
    assert system.id == str(oid)


def test_game_system_out_camel_case_json():
    """Serialized JSON must use camelCase to match TypeScript GameSystem type."""
    from app.models.systems import GameSystemOut

    system = GameSystemOut(
        **{
            "_id": str(ObjectId()),
            "project_id": "proj123",
            "nodes": [],
            "edges": [],
            "updated_at": datetime.utcnow(),
        }
    )
    data = system.model_dump(by_alias=True)
    assert "projectId" in data
    assert "updatedAt" in data
    assert "_id" in data


def test_balance_analysis_out_validates_lists():
    from app.models.systems import BalanceAnalysisOut

    analysis = BalanceAnalysisOut(
        exploits=["exploit1"],
        power_creep=["creep1"],
        dominant_strategies=["strat1"],
        suggestions=["fix1"],
    )
    assert analysis.exploits == ["exploit1"]
    assert analysis.power_creep == ["creep1"]
    assert analysis.dominant_strategies == ["strat1"]
    assert analysis.suggestions == ["fix1"]


def test_balance_analysis_out_camel_case_json():
    """Serialized JSON must use camelCase to match TypeScript BalanceAnalysis type."""
    from app.models.systems import BalanceAnalysisOut

    analysis = BalanceAnalysisOut(
        exploits=[],
        power_creep=["creep"],
        dominant_strategies=["strat"],
        suggestions=[],
    )
    data = analysis.model_dump(by_alias=True)
    assert "powerCreep" in data
    assert "dominantStrategies" in data
    assert "analyzedAt" in data


def test_balance_analysis_out_defaults_to_empty_lists():
    from app.models.systems import BalanceAnalysisOut

    analysis = BalanceAnalysisOut()
    assert analysis.exploits == []
    assert analysis.power_creep == []
    assert analysis.dominant_strategies == []
    assert analysis.suggestions == []


def test_game_system_create_defaults():
    from app.models.systems import GameSystemCreate

    body = GameSystemCreate()
    assert body.nodes == []
    assert body.edges == []


def test_analyze_request_parses_nodes_and_edges():
    from app.models.systems import AnalyzeRequest, SystemNodeIn, SystemEdgeIn

    req = AnalyzeRequest(
        nodes=[SystemNodeIn(id="n1", type="entity", label="Player")],
        edges=[SystemEdgeIn(id="e1", source="n1", target="n2")],
    )
    assert len(req.nodes) == 1
    assert len(req.edges) == 1
