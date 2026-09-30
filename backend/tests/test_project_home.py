from datetime import datetime

import pytest

from tests.conftest import TEST_PROJECT, TEST_PROJECT_ID

DOC = {**TEST_PROJECT, "created_at": datetime(2026, 9, 30), "updated_at": datetime(2026, 9, 30)}


def _patch(client, home):
    return client.patch(f"/projects/{TEST_PROJECT_ID}", json={"home": home})


def _set(mock_db):
    return mock_db.projects.update_one.call_args.args[1]["$set"]


def test_home_defaults_to_local(client, mock_db):
    mock_db.projects.find_one.return_value = dict(DOC)
    home = client.get(f"/projects/{TEST_PROJECT_ID}").json()["home"]
    assert home["publishTarget"] == "local"
    assert home["repoUrl"] is None and home["lastSavedAt"] is None


@pytest.mark.parametrize("url", [
    "https://github.com/MihirSahu14/RippleGG.git",
    "https://gitlab.com/team/game",
    "git@github.com:MihirSahu14/RippleGG.git",
])
def test_home_accepts_repo_urls(client, mock_db, url):
    mock_db.projects.find_one.return_value = dict(DOC)
    assert _patch(client, {"repoUrl": url, "publishTarget": "github_pages"}).status_code == 200
    saved = _set(mock_db)
    assert saved["home.repo_url"] == url and saved["home.publish_target"] == "github_pages"


def test_home_patch_only_changes_given_fields(client, mock_db):
    mock_db.projects.find_one.return_value = dict(DOC)
    assert _patch(client, {"publishTarget": "itch"}).status_code == 200
    saved = _set(mock_db)
    assert saved["home.publish_target"] == "itch"
    assert "home" not in saved and not any(k.startswith("home.") and k != "home.publish_target" for k in saved)


@pytest.mark.parametrize("url", [
    "https://ghp_abc123@github.com/a/b.git",
    "https://user:pass@gitlab.com/a/b",
    "ftp://example.com/repo",
    "github.com/a/b",
    "https://github.com/a/b.git\n",
    "https://github.com/a/b@c",
    "git@github.com:a/b.git\n",
])
def test_home_rejects_credential_or_odd_urls(client, mock_db, url):
    mock_db.projects.find_one.return_value = dict(DOC)
    assert _patch(client, {"repoUrl": url}).status_code == 422


@pytest.mark.parametrize("target,ok", [("mihirsahu14/ripple", True), ("ripple", False), ("a/b/c", False)])
def test_itch_target_pattern(client, mock_db, target, ok):
    mock_db.projects.find_one.return_value = dict(DOC)
    assert (_patch(client, {"itchTarget": target}).status_code == 200) is ok


def test_record_saved_and_published(client, mock_db):
    mock_db.projects.find_one.return_value = dict(DOC)
    assert client.post(f"/projects/{TEST_PROJECT_ID}/home/saved", json={"commit": "8644ffe"}).status_code == 200
    s = _set(mock_db)
    assert s["home.last_saved_commit"] == "8644ffe" and "home.last_saved_at" in s
    assert client.post(f"/projects/{TEST_PROJECT_ID}/home/saved", json={"commit": "nothex!"}).status_code == 422

    mock_db.projects.find_one.return_value = dict(DOC)
    url = "https://mihirsahu14.github.io/RippleGG/"
    assert client.post(f"/projects/{TEST_PROJECT_ID}/home/published", json={"url": url}).status_code == 200
    p = _set(mock_db)
    assert p["home.last_published_url"] == url and "home.last_published_at" in p
    assert client.post(f"/projects/{TEST_PROJECT_ID}/home/published", json={"url": "javascript:alert(1)"}).status_code == 422
