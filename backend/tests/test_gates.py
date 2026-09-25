"""Stage gates — pure function, table-driven. Evidence in, (label, ok) checks out."""
from datetime import datetime, timedelta

import pytest

from app.services.gates import compute_gate, open_placeholders, summarize_gate

NOW = datetime(2026, 9, 25, 12)
BEFORE = NOW - timedelta(days=1)
AFTER = NOW + timedelta(days=1)
FULL_CARD = {
    "genre": "rpg", "unique_hook": "Bees rewind time",
    "pillars": ["Tense", "Readable", "Short runs"], "wont_do": ["No multiplayer"],
}
GOOD_SESSION = {"testers": 3, "ring": "friends", "created_at": AFTER}
DONE_GUIDE = {"unity_guide": {"completed": [True, True]}}

ALL_PITCH = [
    "Write your hook", "Name exactly 3 pillars",
    "List at least 1 thing the game won't do", "Pick a genre",
]

CASES = [
    # name, project, sessions, assets, build_guides, expected_missing
    ("pitch empty", {"stage": "pitch"}, [], [], [], ALL_PITCH),
    ("pitch complete", {"stage": "pitch", "concept_card": FULL_CARD}, [], [], [], []),
    ("pitch blank pillar doesn't count",
     {"stage": "pitch", "concept_card": {**FULL_CARD, "pillars": ["a", "b", " "]}}, [], [], [],
     ["Name exactly 3 pillars"]),
    ("pitch blank hook and won't-do",
     {"stage": "pitch", "concept_card": {**FULL_CARD, "unique_hook": "  ", "wont_do": [""]}}, [], [], [],
     ["Write your hook", "List at least 1 thing the game won't do"]),
    ("prototype self-only session",
     {"stage": "prototype", "prototype_decision": "continue"},
     [{"testers": 5, "ring": "self", "created_at": AFTER}], [], [],
     ["Log a playtest session with 3+ testers outside yourself"]),
    ("prototype two testers",
     {"stage": "prototype", "prototype_decision": "continue"},
     [{"testers": 2, "ring": "discord", "created_at": AFTER}], [], [],
     ["Log a playtest session with 3+ testers outside yourself"]),
    ("prototype evidence but undecided", {"stage": "prototype"}, [GOOD_SESSION], [], [],
     ["Decide to continue"]),
    ("prototype met", {"stage": "prototype", "prototype_decision": "continue"}, [GOOD_SESSION], [], [], []),
    ("prototype session predates a pivot back into this stage",
     {"stage": "prototype", "stage_entered_at": NOW, "prototype_decision": "continue"},
     [{**GOOD_SESSION, "created_at": BEFORE}], [], [],
     ["Log a playtest session with 3+ testers outside yourself"]),
    ("prototype session after a pivot counts",
     {"stage": "prototype", "stage_entered_at": NOW, "prototype_decision": "continue"},
     [{**GOOD_SESSION, "created_at": AFTER}], [], [], []),
    ("slice session predates the stage",
     {"stage": "slice", "stage_entered_at": NOW, "gates": {"comprehension_resolved": True}},
     [{**GOOD_SESSION, "created_at": BEFORE}], [], [],
     ["Log a playtest session since entering the slice"]),
    ("slice legacy project without stage_entered_at",
     {"stage": "slice"}, [{**GOOD_SESSION, "created_at": BEFORE}], [], [],
     ["Resolve comprehension issues"]),
    ("slice met",
     {"stage": "slice", "stage_entered_at": NOW, "gates": {"comprehension_resolved": True}},
     [GOOD_SESSION], [], [], []),
    ("production before alpha",
     {"stage": "production", "gates": {"beta_content_complete": True}}, [GOOD_SESSION], [], [],
     ["Alpha: feature lock", "Log a playtest session since alpha"]),
    ("production session predates alpha",
     {"stage": "production", "alpha_at": NOW,
      "gates": {"alpha_feature_lock": True, "beta_content_complete": True}},
     [{**GOOD_SESSION, "created_at": BEFORE}], [], [],
     ["Log a playtest session since alpha"]),
    ("production met",
     {"stage": "production", "alpha_at": NOW,
      "gates": {"alpha_feature_lock": True, "beta_content_complete": True}},
     [GOOD_SESSION], [], [], []),
    ("ship open placeholder, no build guide",
     {"stage": "ship", "provenance_generated_at": NOW}, [], [{"placeholder": True}], [],
     ["Replace or disclose every placeholder asset", "Check every build-guide step"]),
    ("ship legacy asset without flags is an open placeholder",
     {"stage": "ship", "provenance_generated_at": NOW}, [], [{"type": "sprite"}], [DONE_GUIDE],
     ["Replace or disclose every placeholder asset"]),
    ("ship unchecked guide step and no report",
     {"stage": "ship"}, [], [{"placeholder": True, "disclosed": True}],
     [{"unity_guide": {"completed": [True, False]}}],
     ["Generate the AI provenance report", "Check every build-guide step"]),
    ("ship empty guide doesn't count",
     {"stage": "ship", "provenance_generated_at": NOW}, [], [], [{"unity_guide": {"completed": []}}],
     ["Check every build-guide step"]),
    ("ship met",
     {"stage": "ship", "provenance_generated_at": NOW}, [],
     [{"placeholder": True, "replaced": True}, {"placeholder": False}], [DONE_GUIDE], []),
]


@pytest.mark.parametrize(
    "project, sessions, assets, guides, expected_missing",
    [case[1:] for case in CASES],
    ids=[case[0] for case in CASES],
)
def test_gate(project, sessions, assets, guides, expected_missing):
    met, missing = summarize_gate(compute_gate(project, sessions, assets, guides))
    assert missing == expected_missing
    assert met is (expected_missing == [])


def test_killed_has_no_gate_and_is_never_met():
    checks = compute_gate({"stage": "killed"}, [], [], [])
    assert checks == []
    assert summarize_gate(checks) == (False, [])


def test_open_placeholders_filters_replaced_and_disclosed():
    assets = [{"name": "a"}, {"name": "b", "replaced": True}, {"name": "c", "disclosed": True},
              {"name": "d", "placeholder": False}]
    assert [a["name"] for a in open_placeholders(assets)] == ["a"]
