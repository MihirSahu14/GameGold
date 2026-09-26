"""Unit tests for playtest context-building helpers (gap 48)."""
from app.services.playtest_service import build_dialogue_context, build_concept_summary


def test_build_dialogue_context_includes_node_fields():
    trees = [
        {
            "npc_name": "Ripple",
            "nodes": [
                {
                    "id": "n1",
                    "speaker": "Mara",
                    "text": "x" * 300,
                    "chapter": "Chapter 1",
                    "choices": [{"text": "Ask", "next": "n2", "effects": {"anxiety": 1}}],
                    "branches": [{"when": "anxiety > 0", "next": "n3"}],
                    "ending": "neutral",
                }
            ],
        }
    ]
    ctx = build_dialogue_context(trees)
    assert "n1" in ctx and "Mara" in ctx and "Chapter 1" in ctx
    assert "Ask" in ctx and "anxiety" in ctx
    assert "ENDING: neutral" in ctx
    # text truncated to ~160 chars, not the full 300
    assert "x" * 300 not in ctx


def test_build_dialogue_context_caps_and_keeps_structure_across_story():
    # A long story: truncation should keep some early AND some late nodes,
    # not just chop the tail (which would hide endings and later chapters).
    nodes = [{"id": f"n{i}", "speaker": "S", "text": "word " * 20, "chapter": f"Ch{i // 10}"} for i in range(200)]
    trees = [{"npc_name": "Story", "nodes": nodes}]
    import re

    ctx = build_dialogue_context(trees, cap=2000)
    assert len(ctx) <= 2000
    kept_indices = [int(m) for m in re.findall(r"\(n(\d+)\)", ctx)]
    assert kept_indices, "expected at least one node to survive truncation"
    assert min(kept_indices) < 20  # something from the start survives
    assert max(kept_indices) > 150  # something near the end survives too


def test_build_dialogue_context_empty_when_no_nodes():
    assert build_dialogue_context([]) == ""
    assert build_dialogue_context([{"npc_name": "Empty", "nodes": []}]) == ""


def test_build_concept_summary_includes_pillars_and_wont_do():
    summary = build_concept_summary(
        {"unique_hook": "Grief via tide pools", "pillars": ["No choice is labeled good or bad"], "wont_do": ["No combat"]},
        "Players will tolerate ambiguous endings",
    )
    assert "tide pools" in summary
    assert "No choice is labeled good or bad" in summary
    assert "No combat" in summary
    assert "ambiguous endings" in summary


def test_build_concept_summary_empty_when_nothing():
    assert build_concept_summary({}, "") == ""
