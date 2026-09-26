"""Narrative dialogue validator (gap 29) — table-driven."""
import pytest

from app.models.assets import DialogueTree
from app.services.dialogue_validate import validate_tree


def _tree(nodes, variables=None, start=None):
    return DialogueTree.model_validate(
        {"nodes": nodes, "variables": variables or {}, "start": start}
    )


OK_NODES = [
    {"id": "a", "speaker": "Narrator", "text": "Hi", "next": "b", "bg": "kitchen", "chapter": "avery"},
    {"id": "b", "speaker": "Avery", "text": "Pick", "choices": [
        {"text": "calm", "next": "c", "effects": {"anxiety": -2}},
        {"text": "panic", "next": "c", "effects": {"anxiety": 1, "avoid": 1}},
    ]},
    {"id": "c", "speaker": "", "text": "", "branches": [
        {"when": "anxiety + avoid <= -2", "next": "good"},
        {"when": "anxiety >= 1", "next": "bad"},
        {"when": "else", "next": "good"},
    ]},
    {"id": "good", "speaker": "Narrator", "text": "Sun.", "ending": "good"},
    {"id": "bad", "speaker": "Narrator", "text": "Rain.", "ending": "bad"},
]
VARS = {"anxiety": 0, "avoid": 0}


def _with(idx, **patch):
    nodes = [dict(n) for n in OK_NODES]
    nodes[idx] = {**nodes[idx], **patch}
    return nodes


CASES = [
    # (label, nodes, variables, start, expected error substring or None, expected warning substring or None)
    ("valid", OK_NODES, VARS, None, None, None),
    ("unknown next", _with(0, next="nope"), VARS, None, "unknown node 'nope'", None),
    ("unknown choice target", _with(1, choices=[{"text": "x", "next": "zzz"}]), VARS, None, "unknown node 'zzz'", None),
    ("unknown branch target", _with(2, branches=[{"when": "else", "next": "zzz"}]), VARS, None, "unknown node 'zzz'", None),
    ("unknown effect var", _with(1, choices=[{"text": "x", "next": "c", "effects": {"mood": 1}}]), VARS, None, "unknown variable 'mood'", None),
    ("unknown when var", _with(2, branches=[{"when": "mood > 1", "next": "good"}, {"when": "else", "next": "bad"}]), VARS, None, "unknown variable 'mood'", None),
    ("bad expression", _with(2, branches=[{"when": "anxiety > one", "next": "good"}]), VARS, None, "bad expression", None),
    ("code injection", _with(2, branches=[{"when": "__import__('os') > 1", "next": "good"}]), VARS, None, "bad expression", None),
    ("else not last", _with(2, branches=[{"when": "else", "next": "good"}, {"when": "anxiety > 1", "next": "bad"}]), VARS, None, "'else' must be the last branch", None),
    ("dead end", _with(3, ending=None), VARS, None, "dead end", None),
    ("unknown start", OK_NODES, VARS, "zzz", "start node 'zzz'", None),
    ("duplicate id", OK_NODES + [{"id": "a", "speaker": "", "text": "dup", "ending": "neutral"}], VARS, None, "duplicate node id 'a'", None),
    ("unreachable", OK_NODES + [{"id": "orphan", "speaker": "", "text": "?", "ending": "neutral"}], VARS, None, None, "unreachable"),
    ("empty", [], VARS, None, "no nodes", None),
]


@pytest.mark.parametrize("label,nodes,variables,start,err,warn", CASES, ids=[c[0] for c in CASES])
def test_validate_tree(label, nodes, variables, start, err, warn):
    errors, warnings = validate_tree(_tree(nodes, variables, start))
    if err is None:
        assert errors == []
    else:
        assert any(err in e for e in errors), errors
    if warn:
        assert any(warn in w for w in warnings), warnings


def test_old_ai_tree_still_parses():
    """Pre-narrative docs (npcName/personality, choices with next=null) keep loading."""
    tree = DialogueTree.model_validate({
        "npcName": "Merchant", "personality": "grumpy",
        "nodes": [{"id": "start", "speaker": "npc", "text": "Hi",
                   "choices": [{"text": "Bye", "next": None}]}],
    })
    assert tree.npc_name == "Merchant"
    assert validate_tree(tree) == ([], [])
