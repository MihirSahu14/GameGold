"""5-stage data model (spec 2026-09-25): stage ids, new project fields, asset provenance flags."""
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.models.assets import AssetOut
from app.models.project import STAGE_ORDER, ConceptCard, ProjectCreate, ProjectOut, ProjectUpdate

NOW = datetime(2026, 9, 25)


def _project(**overrides) -> dict:
    return {
        "_id": "p1", "user_id": "u1", "title": "T", "genre": "rpg", "platform": "pc",
        "tone": "epic", "stage": "pitch", "created_at": NOW, "updated_at": NOW, **overrides,
    }


def test_stage_order_is_the_five_stage_ladder():
    assert STAGE_ORDER == ["pitch", "prototype", "slice", "production", "ship"]


def test_project_out_defaults_new_fields_for_legacy_docs():
    out = ProjectOut(**_project())
    assert out.gates == {}
    assert out.cut_list == []
    assert out.prototype_decision is None
    assert out.stage_entered_at is None


@pytest.mark.parametrize("stage, mapped", [
    ("concept", "pitch"), ("gdd", "pitch"),
    ("systems", "prototype"), ("assets", "prototype"), ("unity", "prototype"),
    ("playtesting", "prototype"), ("deployment", "prototype"),
])
def test_project_out_maps_legacy_stage_ids_instead_of_500ing(stage, mapped):
    # Safety net for migration/deploy ordering: if migrate_stages.py hasn't run yet
    # against prod Mongo, reading a project must not 500 — it maps on the way out.
    out = ProjectOut(**_project(stage=stage))
    assert out.stage == mapped


def test_concept_card_caps_pillars_at_three_and_accepts_camel_case():
    card = ConceptCard(title="T", genre="rpg", platform="pc", pillars=["a", "b", "c"], wontDo=["no pvp"])
    assert card.wont_do == ["no pvp"]
    with pytest.raises(ValidationError):
        ConceptCard(title="T", genre="rpg", platform="pc", pillars=["a", "b", "c", "d"])


def test_stage_is_not_client_settable():
    assert "stage" not in ProjectUpdate.model_fields
    assert "stage" not in ProjectCreate.model_fields


def test_asset_out_defaults_provenance_flags():
    out = AssetOut(_id="a1", project_id="p1", type="script", name="X", created_at=NOW)
    assert (out.placeholder, out.replaced, out.disclosed) == (True, False, False)
