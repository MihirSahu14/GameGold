"""AI provenance report (no LLM) + per-asset replaced/disclosed flags."""
import io
import zipfile
from datetime import datetime
from unittest.mock import MagicMock

from bson import ObjectId

from app.services.deployment_service import provenance_markdown
from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID, make_cursor

ASSETS = [
    {"type": "sprite", "name": "Hero", "placeholder": True, "replaced": False, "disclosed": False},
    {"type": "sprite", "name": "Coin", "placeholder": True, "replaced": True, "disclosed": False},
    {"type": "script", "name": "Dasher"},  # legacy doc: counts as an open placeholder
    {"type": "dialogue", "name": "Merchant", "placeholder": True, "disclosed": True},
]


def test_provenance_groups_by_steam_category_and_counts_open_placeholders():
    md = provenance_markdown("Bee Game", ASSETS)
    assert "## Art (pre-generated)" in md
    assert "## Code (pre-generated)" in md
    assert "## Text & dialogue (pre-generated)" in md
    assert "| Hero | yes | no | no |" in md
    assert "| Coin | yes | yes | no |" in md
    assert "| Dasher | yes | no | no |" in md
    assert "| Merchant | yes | no | yes |" in md
    assert "Undisclosed placeholders still in the build: 2" in md


def test_provenance_with_no_assets():
    md = provenance_markdown("Bee Game", [])
    assert "No AI-generated assets." in md
    assert "Undisclosed placeholders still in the build: 0" in md


def test_provenance_escapes_pipes_and_newlines_in_asset_names():
    assets = [{"type": "sprite", "name": "Sword | Shield\nCombo"}]
    md = provenance_markdown("Bee Game", assets)
    assert "| Sword \\| Shield Combo | yes | no | no |" in md
    # The row must still be a single well-formed table line — no stray pipe splits it.
    row = next(line for line in md.splitlines() if line.startswith("| Sword"))
    assert row.count("|") == 6  # 5 cell separators + 1 escaped pipe inside the name


def test_provenance_endpoint_returns_markdown_and_stamps_project(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.assets.find.return_value = make_cursor(ASSETS)
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/export/provenance")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/markdown")
    assert "AI_DISCLOSURE.md" in resp.headers["content-disposition"]
    assert "| Hero | yes | no | no |" in resp.text
    stamp = mock_db.projects.update_one.call_args[0][1]["$set"]
    assert isinstance(stamp["provenance_generated_at"], datetime)


def test_export_bundle_includes_ai_disclosure_and_stamps(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    mock_db.assets.find.return_value = make_cursor(ASSETS)
    resp = client.get(f"/projects/{TEST_PROJECT_ID}/export")
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    assert "Undisclosed placeholders still in the build: 2" in zf.read("AI_DISCLOSURE.md").decode()
    assert "provenance_generated_at" in mock_db.projects.update_one.call_args[0][1]["$set"]


def _asset_doc(**overrides) -> dict:
    return {"_id": ObjectId(), "project_id": TEST_PROJECT_ID, "type": "sprite", "name": "Hero",
            "created_at": datetime.utcnow(), **overrides}


def test_patch_asset_marks_replaced(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    doc = _asset_doc(replaced=True)
    mock_db.assets.update_one.return_value = MagicMock(matched_count=1)
    mock_db.assets.find_one.return_value = doc
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}/assets/{doc['_id']}", json={"replaced": True})
    assert resp.status_code == 200
    assert resp.json()["replaced"] is True
    assert mock_db.assets.update_one.call_args[0][1] == {"$set": {"replaced": True}}


def test_patch_asset_with_no_fields_is_422(client, mock_db):
    mock_db.projects.find_one.return_value = TEST_PROJECT
    resp = client.patch(f"/projects/{TEST_PROJECT_ID}/assets/{ObjectId()}", json={})
    assert resp.status_code == 422
    mock_db.assets.update_one.assert_not_called()
