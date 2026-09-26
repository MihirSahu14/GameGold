"""migrate_stages.py — pure update builders; idempotent by construction."""
import pytest

from scripts.migrate_stages import asset_updates, project_updates


def _apply(doc: dict, updates: dict) -> dict:
    """Apply a Mongo $set (one level of dotted keys) to a plain dict."""
    out = {**doc}
    if isinstance(out.get("concept_card"), dict):
        out["concept_card"] = dict(out["concept_card"])
    for key, value in updates.items():
        if "." in key:
            parent, child = key.split(".", 1)
            out[parent][child] = value
        else:
            out[key] = value
    return out


@pytest.mark.parametrize("old, new", [
    ("concept", "pitch"), ("gdd", "pitch"), (None, "pitch"),
    ("systems", "prototype"), ("assets", "prototype"), ("unity", "prototype"),
    ("playtesting", "prototype"), ("deployment", "prototype"),
])
def test_old_stage_ids_map_to_new(old, new):
    doc = {} if old is None else {"stage": old}
    assert project_updates(doc)["stage"] == new


def test_project_migration_backfills_card_lists_and_is_idempotent():
    doc = {"stage": "gdd", "concept_card": {"title": "T", "unique_hook": "h"}}
    updates = project_updates(doc)
    assert updates == {"stage": "pitch", "concept_card.pillars": [], "concept_card.wont_do": []}
    assert project_updates(_apply(doc, updates)) == {}


def test_new_stage_ids_and_null_cards_are_left_alone():
    assert project_updates({"stage": "slice", "concept_card": None}) == {}
    assert project_updates({"stage": "killed"}) == {}


def test_asset_migration_marks_legacy_assets_placeholder_once():
    updates = asset_updates({"type": "sprite"})
    assert updates == {"placeholder": True, "replaced": False, "disclosed": False}
    assert asset_updates({"type": "sprite", **updates}) == {}
    assert asset_updates({"placeholder": False, "replaced": True, "disclosed": True}) == {}
